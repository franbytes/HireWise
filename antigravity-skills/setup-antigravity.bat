@echo off
REM setup-antigravity.bat
REM Instala o sistema de squads como Skills globais no Google Antigravity
REM Execute uma vez. Os squads ficam disponíveis em todos os projetos.

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "SKILLS_SOURCE=%SCRIPT_DIR%antigravity-skills"
set "GLOBAL_SKILLS=%USERPROFILE%\.gemini\antigravity\skills"

echo.
echo ===========================================
echo  Instalando Squads no Google Antigravity
echo ===========================================
echo.

REM Verifica se a pasta de skills existe
if not exist "%SKILLS_SOURCE%" (
    echo ERRO: Pasta 'antigravity-skills' nao encontrada.
    echo Execute este script da mesma pasta onde esta a pasta 'antigravity-skills'.
    pause
    exit /b 1
)

REM Cria diretório global de skills do Antigravity
echo Criando diretorio global de skills...
if not exist "%GLOBAL_SKILLS%" mkdir "%GLOBAL_SKILLS%"

REM Copia todas as skills
echo Copiando skills para %GLOBAL_SKILLS%...
xcopy /E /I /Y "%SKILLS_SOURCE%\ceo-orchestrator" "%GLOBAL_SKILLS%\ceo-orchestrator" >nul
xcopy /E /I /Y "%SKILLS_SOURCE%\c-level-squad" "%GLOBAL_SKILLS%\c-level-squad" >nul
xcopy /E /I /Y "%SKILLS_SOURCE%\brand-squad" "%GLOBAL_SKILLS%\brand-squad" >nul
xcopy /E /I /Y "%SKILLS_SOURCE%\copy-squad" "%GLOBAL_SKILLS%\copy-squad" >nul
xcopy /E /I /Y "%SKILLS_SOURCE%\design-squad" "%GLOBAL_SKILLS%\design-squad" >nul
xcopy /E /I /Y "%SKILLS_SOURCE%\data-squad" "%GLOBAL_SKILLS%\data-squad" >nul
xcopy /E /I /Y "%SKILLS_SOURCE%\traffic-masters" "%GLOBAL_SKILLS%\traffic-masters" >nul
xcopy /E /I /Y "%SKILLS_SOURCE%\hormozi-squad" "%GLOBAL_SKILLS%\hormozi-squad" >nul
xcopy /E /I /Y "%SKILLS_SOURCE%\storytelling" "%GLOBAL_SKILLS%\storytelling" >nul
xcopy /E /I /Y "%SKILLS_SOURCE%\advisory-board" "%GLOBAL_SKILLS%\advisory-board" >nul
xcopy /E /I /Y "%SKILLS_SOURCE%\movement" "%GLOBAL_SKILLS%\movement" >nul
xcopy /E /I /Y "%SKILLS_SOURCE%\cybersecurity" "%GLOBAL_SKILLS%\cybersecurity" >nul
xcopy /E /I /Y "%SKILLS_SOURCE%\claude-code-mastery" "%GLOBAL_SKILLS%\claude-code-mastery" >nul

echo    OK - 13 skills instaladas (CEO + 12 squads)

echo.
echo ===========================================
echo  Instalacao concluida!
echo ===========================================
echo.
echo Skills instaladas em:
echo    %GLOBAL_SKILLS%
echo.
echo Como usar em QUALQUER projeto:
echo.
echo    PASSO 1: Copie o AGENTS.md para a pasta do projeto
echo    copy "%SCRIPT_DIR%antigravity-skills\AGENTS.md" "C:\seu-projeto\"
echo.
echo    PASSO 2: Abra o projeto no Antigravity
echo.
echo    PASSO 3: No chat do agente, digite:
echo    @ceo-orchestrator novo projeto: [descreva aqui]
echo.
echo Para projetos EXISTENTES:
echo    @ceo-orchestrator analise este projeto
echo.
echo ===========================================
pause
