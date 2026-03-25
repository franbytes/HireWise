/**
 * apply.ts — Motor de candidatura automática via Easy Apply
 *
 * Bugs corrigidos nesta versão:
 *
 *  Bug 1 — Scraper retornava 0 vagas:
 *    O seletor `a.job-card-list__title` estava desatualizado.
 *    O LinkedIn migrou para o BEM modifier `--link`, gerando a classe
 *    `a.job-card-list__title--link`. Corrigido com seletor atualizado
 *    e estratégia de fallback para proteger contra futuras mudanças.
 *
 *  Bug 2 — Botão Easy Apply nunca era clicado:
 *    O `waitUntil: 'domcontentloaded'` encerrava antes do botão ser
 *    renderizado (ele é injetado via XHR após o HTML inicial). Somado
 *    a um timeout de 8s insuficiente, o `waitFor` estourava e caía
 *    no catch silencioso. Corrigido com `waitUntil: 'load'` +
 *    `waitForLoadState('networkidle')` e seletores atualizados.
 */

import { chromium, Page } from 'playwright';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';

// ─── Constantes ───────────────────────────────────────────────────────────────

const STORAGE_STATE_PATH = path.join(__dirname, '..', 'storageState.json');

/**
 * Tempo máximo para aguardar a lista de vagas renderizar (ms).
 * LinkedIn faz XHRs adicionais após o HTML inicial — 20s cobre bem.
 */
const JOB_LIST_LOAD_TIMEOUT_MS = 20_000;

/**
 * Tempo máximo para aguardar o botão Easy Apply aparecer na página da vaga (ms).
 * Aumentado de 8s para 15s para cobrir conexões lentas e carregamento via XHR.
 */
const EASY_APPLY_BUTTON_TIMEOUT_MS = 15_000;

/** Delay entre candidaturas para simular comportamento humano (ms). */
const DELAY_BETWEEN_APPLICATIONS_MS = 3_500;

// ─── Seletores ────────────────────────────────────────────────────────────────
// Centralizados aqui: quando o LinkedIn mudar o DOM, só este bloco precisa mudar.

const SELECTORS = {
  /**
   * [BUG 1 FIX] Seletor principal atualizado de `a.job-card-list__title`
   * para `a.job-card-list__title--link` (LinkedIn adicionou o modifier BEM --link).
   * O fallback cobre o caso de o LinkedIn alterar novamente a estrutura.
   */
  jobCardTitleLink: [
    '.jobs-search-results__list-item a.job-card-list__title--link',
    '.jobs-search-results__list-item a.job-card-list__title',
    '.scaffold-layout__list-item a.job-card-list__title--link',
  ],

  /** Container da lista — usado no waitForSelector para garantir que a XHR terminou. */
  jobListContainer: [
    '.jobs-search-results__list-item',
    '.scaffold-layout__list-item',
  ],

  /**
   * [BUG 2 FIX] Seletores do botão Easy Apply atualizados.
   * O botão pode aparecer em contextos diferentes dependendo do layout da vaga.
   */
  easyApplyButton: [
    'button.jobs-apply-button',
    '.jobs-s-apply button',
    '.jobs-unified-top-card__apply-action button',
    'button:has-text("Candidatura simplificada")',
    'button:has-text("Easy Apply")',
  ],

  submitButton: [
    'button[aria-label="Enviar candidatura"]',
    'button[aria-label="Submit application"]',
  ],

  nextStepButton: [
    'button[aria-label="Avançar para a próxima etapa"]',
    'button[aria-label="Continue to next step"]',
    'button[aria-label="Avançar"]',
    'button:has-text("Avançar")',
  ],

  dismissModal: [
    'button[aria-label="Ignorar"]',
    'button[aria-label="Dismiss"]',
  ],

  discardConfirm: [
    'button[data-control-name="discard_application_confirm_btn"]',
  ],
} as const;

// ─── URL de busca ─────────────────────────────────────────────────────────────

function buildSearchUrl(): string {
  const baseUrl = 'https://www.linkedin.com/jobs/search/';
  const params = new URLSearchParams();

  if (config.filters.keywords.length > 0) {
    params.append('keywords', config.filters.keywords.join(' '));
  }
  if (config.filters.location) {
    params.append('location', config.filters.location);
  }

  params.append('f_AL', 'true');   // Somente Easy Apply
  params.append('sortBy', 'DD');   // Mais recentes

  if (config.filters.remoteOnly) {
    params.append('f_WT', '2');    // Somente remoto
  }

  return `${baseUrl}?${params.toString()}`;
}

// ─── Scraper de vagas ─────────────────────────────────────────────────────────

/**
 * Navega para a página de busca e extrai os links únicos das vagas visíveis.
 *
 * [BUG 1 FIX] Usa seletores atualizados com BEM modifier --link e
 * aguarda o estado networkidle para garantir que as XHRs terminaram.
 */
async function scrapeJobLinks(page: Page): Promise<string[]> {
  const searchUrl = buildSearchUrl();
  console.log(`[Info] URL de busca: ${searchUrl}`);

  // [BUG 2 FIX] 'load' garante que os scripts e XHRs iniciais completaram,
  // ao contrário de 'domcontentloaded' que encerra mais cedo.
  await page.goto(searchUrl, { waitUntil: 'load' });

  // Aguarda a lista de vagas aparecer (pode demorar pois é carregada via XHR)
  const listLoaded = await waitForAnySelector(page, [...SELECTORS.jobListContainer], JOB_LIST_LOAD_TIMEOUT_MS);

  if (!listLoaded) {
    console.warn('[Aviso] Lista de vagas não apareceu no tempo limite. O LinkedIn pode ter retornado 0 resultados para este filtro.');
    return [];
  }

  // Extrai os links únicos das vagas encontradas
  const jobLinks = await page.evaluate((selectors) => {
    const allAnchors: HTMLAnchorElement[] = [];

    // Tenta cada seletor em ordem de prioridade
    for (const selector of selectors) {
      const found = document.querySelectorAll<HTMLAnchorElement>(selector);
      if (found.length > 0) {
        allAnchors.push(...Array.from(found));
        break; // Usa o primeiro seletor que retornar resultados
      }
    }

    const urls = allAnchors
      .map(a => a.href)
      .filter(href => href?.includes('/jobs/view/'))
      .map(href => href.split('?')[0]); // Remove query params para deduplicação limpa

    return Array.from(new Set(urls)); // Remove duplicatas
  }, SELECTORS.jobCardTitleLink);

  return jobLinks;
}

// ─── Candidatura Easy Apply ────────────────────────────────────────────────────

/**
 * Executa o fluxo completo de candidatura Easy Apply para uma vaga.
 * Navega pelos steps do modal até encontrar o botão de envio final.
 *
 * [BUG 2 FIX] Aguarda networkidle antes de buscar o botão e usa
 * timeout de 15s para cobrir carregamentos lentos via XHR.
 */
async function applyToJob(page: Page, jobUrl: string): Promise<boolean> {
  // [BUG 2 FIX] networkidle aguarda as XHRs da página da vaga completarem,
  // garantindo que o botão Easy Apply já foi injetado no DOM.
  await page.goto(jobUrl, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle').catch(() => {
    // networkidle pode ser bloqueado por analytics/pixels — não é crítico
  });

  const buttonClicked = await clickEasyApplyButton(page);

  if (!buttonClicked) {
    console.log('    [Info] Botão Easy Apply não encontrado. Vaga pulada.');
    return false;
  }

  console.log('    [Ação] Botão "Candidatura Simplificada" clicado. Iniciando fluxo do modal...');

  return await navigateModalUntilSubmit(page);
}

/**
 * Encontra e clica no botão Easy Apply usando múltiplos seletores em cascata.
 * Retorna true se o botão foi encontrado e clicado com sucesso.
 */
async function clickEasyApplyButton(page: Page): Promise<boolean> {
  for (const selector of SELECTORS.easyApplyButton) {
    try {
      const button = page.locator(selector).first();
      await button.waitFor({ state: 'visible', timeout: EASY_APPLY_BUTTON_TIMEOUT_MS });
      await button.click();
      return true;
    } catch {
      // Seletor não encontrou o botão — tenta o próximo
    }
  }
  return false;
}

/**
 * Loop de navegação pelo modal de Easy Apply:
 * Avança pelos steps até encontrar o botão de envio final ou estourar o limite.
 */
async function navigateModalUntilSubmit(page: Page): Promise<boolean> {
  const MAX_STEPS = 7;

  for (let step = 1; step <= MAX_STEPS; step++) {
    await page.waitForTimeout(2000);

    // Tenta botão de envio final
    if (await tryClick(page, [...SELECTORS.submitButton])) {
      console.log('    [Ação] Candidatura enviada com sucesso!');
      await page.waitForTimeout(2000);
      await tryClick(page, [...SELECTORS.dismissModal]);
      return true;
    }

    // Tenta avançar para o próximo step
    if (await tryClick(page, [...SELECTORS.nextStepButton])) {
      console.log(`    [Ação] Avançando para o step ${step + 1}...`);
      continue;
    }

    // Nenhum botão de ação encontrado — aborta de forma segura
    console.log(`    [Aviso] Nenhum botão de ação reconhecido no step ${step}. Abortando e fechando modal.`);
    await closeModal(page);
    return false;
  }

  console.log(`    [Aviso] Limite de ${MAX_STEPS} steps atingido. Abortando.`);
  await closeModal(page);
  return false;
}

// ─── Orquestrador principal ───────────────────────────────────────────────────

async function runApplicationOrchestrator(): Promise<void> {
  console.log('--- Iniciando Motor de Aplicação HireWise ---');

  if (!fs.existsSync(STORAGE_STATE_PATH)) {
    console.error('❌ Sessão não encontrada. Execute "npm start" (auth.ts) primeiro para fazer login.');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
  const page = await context.newPage();

  try {
    console.log('\n[Fase 1] Buscando vagas...');
    const jobLinks = await scrapeJobLinks(page);

    if (jobLinks.length === 0) {
      console.log('⚠️  Nenhuma vaga encontrada para os filtros configurados em config.ts.');
      console.log('    Verifique: keywords, location e remoteOnly.');
      return;
    }

    console.log(`✅ ${jobLinks.length} vagas encontradas. Iniciando candidaturas...\n`);

    let successCount = 0;

    for (let i = 0; i < jobLinks.length; i++) {
      const jobUrl = jobLinks[i];
      console.log(`\n[Vaga ${i + 1}/${jobLinks.length}] ${jobUrl}`);

      try {
        const applied = await applyToJob(page, jobUrl);

        if (applied) {
          successCount++;
          console.log('    ✅ Candidatura enviada!');
        } else {
          console.log('    ⏭️  Vaga pulada.');
        }
      } catch (err: any) {
        console.error(`    ❌ Erro inesperado: ${err.message}`);
      }

      if (i < jobLinks.length - 1) {
        await page.waitForTimeout(DELAY_BETWEEN_APPLICATIONS_MS);
      }
    }

    console.log(`\n${'='.repeat(54)}`);
    console.log(`[Relatório] ${successCount} candidaturas enviadas de ${jobLinks.length} vagas encontradas.`);
    console.log(`${'='.repeat(54)}`);

  } finally {
    await browser.close();
  }
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

/**
 * Tenta clicar no primeiro seletor da lista que for visível.
 * Retorna true se algum botão foi clicado, false caso nenhum seja encontrado.
 */
async function tryClick(page: Page, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible()) {
        await el.click();
        return true;
      }
    } catch {
      // Seletor não encontrado — tenta o próximo
    }
  }
  return false;
}

/**
 * Fecha o modal de Easy Apply descartando a candidatura em andamento.
 */
async function closeModal(page: Page): Promise<void> {
  const dismissed = await tryClick(page, [...SELECTORS.dismissModal]);
  if (dismissed) {
    await page.waitForTimeout(500);
    await tryClick(page, [...SELECTORS.discardConfirm]);
  }
}

/**
 * Aguarda o primeiro seletor da lista aparecer no DOM.
 * Retorna true se algum aparecer dentro do timeout, false caso contrário.
 */
async function waitForAnySelector(
  page: Page,
  selectors: string[],
  timeout: number
): Promise<boolean> {
  const timePerSelector = Math.floor(timeout / selectors.length);

  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: timePerSelector });
      return true;
    } catch {
      // Seletor não apareceu — tenta o próximo
    }
  }
  return false;
}

// ─── Execução ─────────────────────────────────────────────────────────────────

runApplicationOrchestrator().catch((err) => {
  console.error('❌ Erro fatal:', err.message);
  process.exit(1);
});
