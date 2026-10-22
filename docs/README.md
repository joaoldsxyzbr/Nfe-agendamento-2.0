# Documentação — NFe Agendamento 2.0

## Arquitetura vigente nesta branch experimental

O produto é uma **extensão Chromium Manifest V3**, com interface interna, sem site próprio e sem backend Cloudflare. O Portal Nacional da NF-e continua sendo externo e requer conexão com a internet.

Leia nesta ordem:

1. [README do projeto](../README.md)
2. [Arquitetura extensão autônoma](architecture/extension-only.md)
3. [Checklist de aceitação física](testing/extension-only-acceptance.md)
4. [Regras de fornecedores](architecture/supplier-rules.md)
5. [Campos fiscais RTC/IBS/CBS](architecture/rtc-ibs-cbs.md)
6. [Interface da consulta](ui/consultation-screen.md)
7. [Plano da migração](plans/2026-10-22-nfe-agendamento-extensao-autonoma.md)

## Histórico

Documentos antigos de site, Worker, Windows Bridge, consultador SEFAZ, Vite, projetos e provas de conceito ficam preservados para rastreabilidade, mas **não definem o runtime desta branch**. São históricos: `architecture/frontend-boundaries.md`, `architecture/site-estatico-sem-vite.md`, `architecture/bridge-security.md`, `superpowers/`, relatórios de releases anteriores e documentos em `operations/` anteriores à mudança.

## Escopo e publicação

Esta documentação descreve apenas `nfe-agendamento`. A `main` mantém sua configuração atual até a homologação e decisão de merge, sem alterações automáticas de Cloudflare.
