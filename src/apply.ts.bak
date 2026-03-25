import { chromium, BrowserContext, Page } from 'playwright';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';

const STORAGE_STATE_PATH = path.join(__dirname, '..', 'storageState.json');

function buildSearchUrl(): string {
    const baseUrl = 'https://www.linkedin.com/jobs/search/';
    const params = new URLSearchParams();
    if (config.filters.keywords.length > 0) params.append('keywords', config.filters.keywords.join(' '));
    if (config.filters.location) params.append('location', config.filters.location);
    params.append('f_AL', 'true');
    if (config.filters.remoteOnly) params.append('f_WT', '2'); 
    params.append('sortBy', 'DD'); 
    return `${baseUrl}?${params.toString()}`;
}

async function processEasyApply(page: Page): Promise<boolean> {
    try {
        // [Bugfix] Procurando Botões de múltiplas formas (Classe literal CSS ou Textos baseados no Idioma PT/EN), 
        // e clicando rigorosamente no primeiro encontrado da página.
        const easyApplyButton = page.locator('button.jobs-apply-button, button:has-text("Candidatura simplificada"), button[aria-label*="Candidatura simplificada"]').first();
        
        await easyApplyButton.waitFor({ state: 'visible', timeout: 8000 });
        await easyApplyButton.click();
        console.log('    [Ação] Botão "Candidatura Simplificada" localizado e clicado com sucesso!');

        let maxSteps = 5;
        while (maxSteps > 0) {
            await page.waitForTimeout(2000); 

            // Se for botão final Enviar
            const submitBtn = page.locator('button[aria-label="Enviar candidatura"], button[aria-label="Submit application"]').first();
            if (await submitBtn.isVisible()) {
                console.log('    [Ação] ---> Botão de Envio FINAL encontrado e sendo submetido!');
                await submitBtn.click();
                await page.waitForTimeout(3000); // Salva envio no Linkedin
                
                const closeBtn = page.locator('button[aria-label="Ignorar"], button[aria-label="Dismiss"]').first();
                if (await closeBtn.isVisible()) await closeBtn.click();
                
                return true; 
            }

            // Se for botão Avançar
            const nextBtn = page.locator('button[aria-label="Avançar para a próxima etapa"], button[aria-label="Continue to next step"], button:has-text("Avançar")').first();
            if (await nextBtn.isVisible()) {
                console.log('    [Ação] Passo intermediário (Múltiplas Telas). Clicando em Avançar...');
                await nextBtn.click();
                maxSteps--;
                continue;
            }

            console.log('    [Aviso] Parada crítica no formulário ou sem mapeamento pro campo faltante. Vaga abortada para segurança natural.');
            break;
        }
        
        console.log('    [Limpeza] Fechando o modal rejeitado...');
        const closeBtn = page.locator('button[aria-label="Ignorar"], button[aria-label="Dismiss"]').first();
        if (await closeBtn.isVisible()) {
            await closeBtn.click();
            const discardBtn = page.locator('button[data-control-name="discard_application_confirm_btn"]').first();
            if (await discardBtn.isVisible()) await discardBtn.click();
        }

        return false;
    } catch (e) {
        console.log('    [Aviso] Vaga ignorada: O Botão "Candidatura Simplificada" exato não foi encontrado ou o layout da página individual diferiu.');
        return false;
    }
}

async function runApplicationOrchestrator() {
    console.log('--- Iniciando Motor de Aplicação de Vagas (Fase 4 Fix) ---');
    
    if (!fs.existsSync(STORAGE_STATE_PATH)) {
        console.error('❌ ERRO: Sessão não encontrada. Faça o Login (npm start) primeiro.');
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
    const page = await context.newPage();

    const url = buildSearchUrl();
    console.log(`[Info] Processando extração estrita da URL: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    
    // Aguardando feed EXATO (15 secs)
    try {
        await page.waitForSelector('.jobs-search-results__list-item', { timeout: 15000 });
    } catch { }

    const jobLinks = await page.evaluate(() => {
        const anchors = document.querySelectorAll('.jobs-search-results__list-item a.job-card-list__title') as NodeListOf<HTMLAnchorElement>;
        return Array.from(new Set(
            Array.from(anchors)
            .map(a => a.href)
            .filter(href => href && href.includes('/jobs/view/'))
            .map(href => href.split('?')[0])
        ));
    });

    if (jobLinks.length === 0) {
        console.log('⚠️ Nenhuma vaga correspondente ao seu filtro FOI extraída corretamente pela URL atual.');
        await browser.close();
        return;
    }

    console.log(`✅ O scraping filtrado obteve: ${jobLinks.length} vagas estritas. Partindo pro preenchimento dinâmico...`);
    
    let sucesso = 0;
    for (let i = 0; i < jobLinks.length; i++) {
        const link = jobLinks[i];
        console.log(`\n======================================================`);
        console.log(`[Vaga ${i + 1}/${jobLinks.length}] Verificando compatibilidade... URL: ${link}`);
        
        try {
            await page.goto(link, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000); // Delay pro layout individual da vaga do linkedin

            const applied = await processEasyApply(page);
            if (applied) {
                sucesso++;
                console.log('    ✅✅ INCRÍVEL: Candidatura submetida e enviada pro banco de dados do Recrutador com sucesso!');
            } else {
                console.log('    ❌ Fluxo cancelado para não travar a aplicação.');
            }
        } catch (e: any) {
             console.error(`    ❌ Erro sistêmico: ${e.message}`);
        }
        
        console.log('    [Info] Rotina de segurança (humanizador): Pausa de 3.5s...');
        await page.waitForTimeout(3500);
    }
    
    console.log(`\n======================================================`);
    console.log(`[Relatório Mestre] Operação Finalizada. Foram enviadas com sucesso ${sucesso} candidaturas do total extraído de ${jobLinks.length} vagas.`);
    await browser.close();
}

runApplicationOrchestrator().catch(console.error);
