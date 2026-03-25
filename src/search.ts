import { chromium, BrowserContext } from 'playwright';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';

const STORAGE_STATE_PATH = path.join(__dirname, '..', 'storageState.json');

function buildSearchUrl(): string {
    const baseUrl = 'https://www.linkedin.com/jobs/search/';
    const params = new URLSearchParams();

    // Palavras-chave do usuário
    if (config.filters.keywords.length > 0) {
        params.append('keywords', config.filters.keywords.join(' '));
    }
    // Localização
    if (config.filters.location) {
        params.append('location', config.filters.location);
    }
    // Simplificada obrigatório
    params.append('f_AL', 'true');
    // Remoto
    if (config.filters.remoteOnly) {
        params.append('f_WT', '2'); 
    }
    // Mais recentes
    params.append('sortBy', 'DD'); 

    return `${baseUrl}?${params.toString()}`;
}

async function searchJobs() {
    console.log('--- Iniciando Squad de Busca e Filtros (Fase 3 Fix) ---');
    
    if (!fs.existsSync(STORAGE_STATE_PATH)) {
        console.error('❌ ERRO FATAL: Sessão não encontrada. Por favor, execute o "npm start" (auth.ts) primeiro para logar.');
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
    const page = await context.newPage();

    const searchUrl = buildSearchUrl();
    console.log(`[Ação] Navegando para a URL Exata do Filtro: \n  -> ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    
    console.log('[Ação] Aguardando o Feed de vagas EXATAS renderizar (Timeout 15s)...');
    try {
        // Garantimos que o script espere a lista real, não recomendações instantâneas
        await page.waitForSelector('.jobs-search-results__list-item', { timeout: 15000 });
    } catch {
        console.log('⚠️ Aviso: LinkedIn demorou muito ou retornou zero vagas pro seu filtro exato.');
    }

    // Extrator rigoroso (Sem fallbacks que puxam vagas sujas do rodapé)
    const jobLinks = await page.evaluate(() => {
        const anchors = document.querySelectorAll(
            '.jobs-search-results__list-item a.job-card-list__title'
        ) as NodeListOf<HTMLAnchorElement>;
        
        // Removemos o 'fallback' de .job-card-container__link para garantir 100% obediência ao filtro
        const visibleLinks = Array.from(anchors);
        
        const processedUrls = visibleLinks
            .map(a => a.href)
            .filter(href => href && href.includes('/jobs/view/'))
            .map(href => href.split('?')[0]); 

        return Array.from(new Set(processedUrls)); 
    });

    if (jobLinks.length === 0) {
        console.log('⚠️  Nenhuma vaga RIGOROSAMENTE filtrada retornou nesta tela.');
    } else {
        console.log(`✅ Sucesso: Foram localizadas ${jobLinks.length} vagas de "Candidatura Simplificada" REAIS.`);
        jobLinks.forEach((link, idx) => console.log(`  [Vaga ${idx + 1}]: ${link}`));
    }
    
    await page.waitForTimeout(3000);
    await browser.close();
}

searchJobs().catch(console.error);
