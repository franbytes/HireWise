import { chromium } from 'playwright';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';

const STORAGE_STATE_PATH = path.join(__dirname, '..', 'storageState.json');

async function debug() {
    console.log('--- CEO Master Orchestrator: Inspecionando DOM do LinkedIn ---');
    const browser = await chromium.launch({ headless: false }); // Usando visível para forçar render do DOM
    const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
    const page = await context.newPage();

    const baseUrl = 'https://www.linkedin.com/jobs/search/';
    const params = new URLSearchParams();
    if (config.filters.keywords.length > 0) params.append('keywords', config.filters.keywords.join(' '));
    if (config.filters.location) params.append('location', config.filters.location);
    params.append('f_AL', 'true'); // Candidatura Simplificada
    if (config.filters.remoteOnly) params.append('f_WT', '2'); // Remoto
    params.append('sortBy', 'DD'); // Mais Recentes
    
    let searchUrl = `${baseUrl}?${params.toString()}`;
    console.log('[DEBUG] URL Alvo da Busca:', searchUrl);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000); // Espera carregamento dinâmico e XHRs profundas
    
    // Testa o que a página diz
    const hasNoResults = await page.evaluate(() => document.body.innerText.includes('Nenhum resultado'));
    console.log('[DEBUG] LinkedIn declarou "Nenhum resultado"? :', hasNoResults);

    // Avalia o Extrator Principal
    const mainFeedJobs = await page.evaluate(() => {
        const anchors = document.querySelectorAll('.jobs-search-results__list-item a.job-card-list__title');
        return Array.from(anchors).map((a: any) => ({
             title: a.innerText.trim(), 
             href: a.href
        }));
    });
    
    console.log(`[DEBUG] Feed Principal de Vagas (Exato): ${mainFeedJobs.length} encontradas.`);
    if (mainFeedJobs.length > 0) {
        console.log(`        -> Ex: ${mainFeedJobs[0].title}`);
    }

    // Avalia o Extrator Fallback (o causador de randoms)
    const fallbackJobs = await page.evaluate(() => {
        const anchors = document.querySelectorAll('.job-card-container__link');
        return Array.from(anchors).map((a: any) => ({
             title: a.innerText.trim(), 
             href: a.href
        }));
    });
    console.log(`[DEBUG] Fallbacks Locais Genéricos (Pode incluir patrocinados/recomendações extra): ${fallbackJobs.length} encontradas.`);

    // Agora inspeciona a página individual de UMA vaga para checar a classe exata do botão Easy Apply
    if (mainFeedJobs.length > 0 || fallbackJobs.length > 0) {
        const urlParaTestar = mainFeedJobs.length > 0 ? mainFeedJobs[0].href : fallbackJobs[0].href;
        console.log(`\n[DEBUG] Entrando em uma vaga para verificar o botão Easy Apply: ${urlParaTestar}`);
        await page.goto(urlParaTestar.split('?')[0], { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(4000);

        // Printa os botões principais da tela de emprego
        const buttons = await page.evaluate(() => {
            const btns = document.querySelectorAll('button');
            return Array.from(btns)
                .map((b: any) => ({ text: b.innerText.trim(), className: b.className, ariaLabel: b.getAttribute('aria-label') }))
                .filter(b => b.text.includes('Candidatura') || b.text.includes('Apply') || (b.ariaLabel && b.ariaLabel.includes('Candidatura')));
        });
        console.log('[DEBUG] Botões de Candidatura Encontrados na tela da Vaga:', buttons);
    }

    await browser.close();
}

debug().catch(console.error);
