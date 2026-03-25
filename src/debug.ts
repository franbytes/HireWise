import { chromium } from 'playwright';

async function debug() {
    console.log('Iniciando análise do DOM da página de login...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle' });
    console.log('URL final:', page.url());
    
    const inputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input')).map(el => ({
            id: el.id,
            name: el.name,
            type: el.type
        }));
    });
    
    console.log('Inputs encontrados:', inputs);
    
    // Tirar screenshot para podermos entender exatamente o que está bloqueando ou qual é a tela
    await page.screenshot({ path: 'debug_screenshot.png' });
    
    await browser.close();
    console.log('Debug finalizado.');
}

debug().catch(console.error);
