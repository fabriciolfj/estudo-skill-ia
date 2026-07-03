---
name: config-project-fullstack
description: >-
  Cria e configura, de forma deterministica e do zero, um monorepo Turborepo
  com frontend Next.js (porta 3000) e backend NestJS (porta 4000, com
  ConfigModule e CORS habilitados). Use quando o usuario pedir para
  inicializar/configurar um novo projeto fullstack Turborepo+Next+Nest, ou
  para aplicar um namespace/escopo npm a um projeto assim.
---

# Config Projeto Fullstack

Automatiza, via script Node.js determinístico, a criação de um monorepo
Turborepo com:

- `apps/frontend`: Next.js (`create-next-app`, `--src-dir`), rodando na porta
  padrão 3000.
- `apps/backend`: NestJS (`nest new`), com `@nestjs/config` (ConfigModule
  global) e `main.ts` escutando `process.env.PORT ?? 4000` com
  `app.enableCors()`.
- `.env` / `.env.example` em ambos os apps (`NEXT_PUBLIC_API_URL` no frontend,
  `PORT` no backend).
- Renomeação opcional do namespace (escopo npm) de todos os pacotes do
  monorepo (raiz, apps e packages), aplicada por último sem afetar os passos
  anteriores.

Toda a lógica vive em [`scripts/setup.js`](scripts/setup.js) — não reimplemente
os passos manualmente. Sempre invoque o script.

## Quando usar

- Pedido para criar/configurar do zero um projeto fullstack com essa stack
  (Turborepo + Next.js + NestJS).
- Pedido para aplicar/alterar o namespace (`@escopo`) de um projeto já
  gerado por esta skill.

## Como executar

Rode a partir da pasta que deve ser a raiz do projeto (pode já conter
arquivos ocultos como `.git`, `.claude`, `.agents` — eles são ignorados):

```bash
node .claude/skills/config-project-fullstack/scripts/setup.js [--namespace=@escopo] [--dir=<caminho>]
```

- `--namespace=@escopo` (opcional): aplica esse escopo npm a todos os
  `package.json` locais (raiz e cada app/pacote), mantendo as dependências
  internas consistentes. Deve ser um escopo npm válido em minúsculas
  (ex.: `@meu-projeto`).
- `--dir=<caminho>` (opcional): diretório alvo. Padrão: diretório atual.

Não passe flags além dessas — o script já reproduz exatamente a sequência de
comandos validada (create-turbo, create-next-app, nest new, etc.).

## Garantias do script

1. **Verificação de pré-requisitos**: aborta se `node`, `npm` ou `npx` não
   estiverem no PATH.
2. **Diretório seguro**: recusa rodar em `/` ou no home do usuário; recusa
   rodar se o diretório alvo tiver qualquer arquivo/pasta não esperado (fora
   de itens ocultos e dos artefatos que o próprio script gera), para garantir
   que a montagem parte do zero.
3. **Determinístico e idempotente**: cada etapa verifica se já foi concluída
   antes de executar (ex.: pula `create-next-app` se `apps/frontend` já
   existir). Rodar o script de novo no mesmo diretório não duplica trabalho
   nem corrompe o estado.
4. **Namespace por último**: a renomeação de pacotes só roda depois que todo
   o resto está pronto, então nunca interfere nos passos de scaffolding.
5. **Verificação final**: ao término, confere que o frontend existe, o
   backend escuta a porta 4000 via env var, o CORS está habilitado, o
   ConfigModule está global e os arquivos `.env` estão corretos. Se algo
   falhar, o script termina com código de saída != 0 e lista o que falhou.

## Passo a passo reproduzido internamente

1. `npx create-turbo@latest <nome> -m npm` (em pasta temporária isolada, cujo
   conteúdo é movido para a raiz do projeto — evita conflito com arquivos
   ocultos já existentes).
2. Remove os apps de exemplo do Turborepo (`apps/*`).
3. `npx create-next-app@latest frontend --yes --src-dir` dentro de `apps/`.
4. Garante `@nestjs/cli` instalado globalmente (`npm i -g @nestjs/cli`).
5. `nest new backend -g -p npm` dentro de `apps/`.
6. `npm install @nestjs/config` dentro de `apps/backend`.
7. Sobrescreve `apps/backend/src/app.module.ts` com `ConfigModule.forRoot({ isGlobal: true })`.
8. Sobrescreve `apps/backend/src/main.ts` com porta `process.env.PORT ?? 4000` e `app.enableCors()`.
9. Adiciona o script `"dev": "nest start --watch"` ao `package.json` do backend.
10. Cria `apps/frontend/.env.example` (`NEXT_PUBLIC_API_URL=http://localhost:4000`) e copia para `.env` (se ainda não existir).
11. Cria `apps/backend/.env.example` (`PORT=4000`) e copia para `.env` (se ainda não existir).
12. Se `--namespace` foi informado, renomeia todos os `package.json` locais
    (raiz e cada item de `apps/`/`packages/`) para `<namespace>` /
    `<namespace>/<pasta>`, e ajusta as dependências internas que referenciavam
    os nomes antigos.
13. Roda a verificação final descrita acima.
