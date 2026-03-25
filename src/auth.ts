import { chromium, BrowserContext } from 'playwright';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';

// Caminho absoluto para salvar a sessão do usuário de forma segura.
const STORAGE_STATE_PATH = path.join(__dirname, '..', 'storageState.json');

/**
 * Função principal responsável por verificar a autenticação e realizar o login no LinkedIn.
 * Segue os princípios de Código Limpo, isolando responsabilidades e tratando
 * as verificações anti-robô da plataforma.
 */
async function login() {
    console.log('--- Iniciando Agente HireWise ---');
    console.log('[Info] Iniciando navegador (Modo Visível)...');
    
    // Inicializa o Chromium no modo não-headless (visível) para debugs ou resolução de CAPTCHAs manuais
    const browser = await chromium.launch({ headless: false }); 
    let context: BrowserContext;

    // 1. Verificação de Sessão Antecipada
    // Checa se o usuário já validou seu login anteriormente. Isso economiza tempo
    // e evita bloqueios por excesso de tentativas no LinkedIn.
    if (fs.existsSync(STORAGE_STATE_PATH)) {
        console.log('[Info] Sessão existente encontrada. Recuperando cookies salvos...');
        context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
    } else {
        console.log('[Info] Nenhuma sessão anterior encontrada. Preparando contexto limpo para login...');
        context = await browser.newContext();
    }

    const page = await context.newPage();
    
    console.log('[Ação] Navegando para a página de login do LinkedIn...');
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'load' });

    // Aguarda um pequeno período para a "hidratação" do framework React utilizado pelo LinkedIn.
    // Isso garante que todos os "listeners" e scripts anti-bot sejam totalmente carregados.
    await page.waitForTimeout(3000);

    // 2. Validação visual da página redirecionada
    // Se, ao carregar a página de login o LinkedIn injetar os cookies da sessão existente
    // e pular o /login instantaneamente, sabemos que não precisamos preencher o formulário.
    if (!page.url().includes('login')) {
        console.log('✅ Login já efetuado com sucesso por sessão prévia.');
    } else {
        console.log('[Ação] Preenchendo credenciais do arquivo config.ts...');
        
        try {
            // Interação: Digitação do E-mail
            // Em vez de "colar" o texto, o método focus -> click -> pressSequentially simula
            // a digitação humana, ajudando a evitar que o sistema o classifique como Automação.
            console.log(`[Ação] Digitando e-mail: ${config.linkedin.email}...`);
            const usernameInput = page.locator('#username');
            await usernameInput.waitFor({ state: 'visible' });
            await usernameInput.click();
            await usernameInput.pressSequentially(config.linkedin.email, { delay: 90 }); // Delay humanizado
            
            // Interação: Digitação da Senha
            console.log('[Ação] Digitando senha...');
            const passwordInput = page.locator('#password');
            await passwordInput.waitFor({ state: 'visible' });
            await passwordInput.click();
            await passwordInput.pressSequentially(config.linkedin.password, { delay: 90 });
            
            // Pausa estratégica para permitir a validação dos scripts JS na página após o preenchimento total.
            await page.waitForTimeout(1000); 
            
            // Interação: Envio (Submit)
            console.log('[Ação] Clicando no botão Entrar...');
            const submitBtn = page.locator('button[type="submit"]');
            await submitBtn.waitFor({ state: 'visible' });
            await submitBtn.click();

        } catch (e) {
            console.error('\n❌ ERRO FATAL: Falha ao localizar os campos na página de login. A estrutura do LinkedIn pode ter sido atualizada.');
            throw e;
        }

        // 3. Verificação Pós-Envio e Resolução de Desafios (CAPTCHA)
        console.log('\n==========================================================');
        console.log('⚠️  ATENÇÃO: NÃO FECHE ESTA JANELA MANUALMENTE!       ⚠️');
        console.log('==========================================================');
        console.log('Verificando status de login. Caso apareça o teste CAPTCHA,');
        console.log('resolva-o no navegador. O agente aguarda até 3 minutos.');
        console.log('==========================================================\n');
        
        try {
            // Verifica o sucesso realístico do login procurando por elementos exclusivos de usuários logados
            // (ex: a foto do perfil na navbar principal) com um timeout tolerante.
            await page.waitForSelector('.global-nav__me, .global-nav__me-photo', { 
                state: 'attached', 
                timeout: 180000 // 3 Minutos permitidos para resolução
            });
            console.log('-> LOGIN VALIDADO COM SUCESSO! Acesso garantido ao portal.');
        } catch (error: any) {
            // Em cenários onde o usuário fecha prematuramente a aba/navegador,
            // capturamos esse erro específico sem estourar toda a aplicação de forma não tratada.
            if (error.message && error.message.includes('closed')) {
                console.error('\n❌ OPERAÇÃO CANCELADA: O navegador foi fechado inesperadamente.');
                console.log('Por favor, recomece e aguarde o próprio agente encerrar o processo.');
                return;
            }
            console.warn('\n[Aviso] O tempo limite esgotou ou não foi possível confirmar o login visualmente.');
            console.log('Tentando salvar o estado atual mesmo assim, pois o login pode ter passado em segundo plano.');
        }

        // 4. Salvamento do Estado e Encerramento Limpo
        console.log('\n[Export] Salvando sessão segura no disco (storageState.json)...');
        await context.storageState({ path: STORAGE_STATE_PATH });
        console.log('✅ Sessão codificada e arquivada com sucesso!');
    }

    console.log('[Info] Desligando o Agente em 5 segundos...');
    await page.waitForTimeout(5000);
    await browser.close();
}

// Ponto de entrada ("Main") encapsulado, blindando a função com tratamento genérico de erros
login().catch(err => {
    console.error('Falha crítica na inicialização do agente:', err);
    process.exit(1);
});
