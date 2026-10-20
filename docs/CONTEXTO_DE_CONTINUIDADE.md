# CONTINUIDADE DO PROJETO — ChatGPT / Codex

> Atualizado em 2026-10-18. Documento de passagem de contexto entre conversas, computadores e ferramentas. **Leia este arquivo no início de uma nova sessão e confira o estado atual do GitHub antes de modificar o código.** Não substitui documentação técnica nem registros reais de execução.

## 1. Propósito e separação dos projetos

Existem **dois repositórios independentes**:

- **Web Imóveis (produção)**: https://github.com/serjaoberrantero1986/imovel-hub
  - Portal imobiliário SaaS com CRM, anúncios, corretores/imobiliárias e sites próprios.
  - Site: https://www.webimoveis.site/
  - Regras de desenvolvimento: https://github.com/serjaoberrantero1986/imovel-hub/blob/main/AGENTS.md
  - Skill de consistência: https://github.com/serjaoberrantero1986/imovel-hub/blob/main/.agents/skills/webimovel-product-consistency/SKILL.md
  - NÃO publicar experimentos do laboratório neste repositório.
- **Imóvel Busca (laboratório experimental)**: https://github.com/serjaoberrantero1986/imovel-busca
  - Site: https://imovel-busca.vercel.app/
  - Projetado para pesquisar, importar, visualizar e comparar anúncios de fontes imobiliárias antes de decidir o que será implementado no SaaS principal.
  - Hospedado em projeto independente na equipe Vercel **Souza's projects** (slug técnico `souza-vercel-projects`).
  - Sem conexão direta com o banco Supabase de produção do Web Imóveis.

### Decisões fundamentais do usuário
1. **Não alterar o Web Imóveis enquanto os testes e a arquitetura da busca multissite estiverem em validação.**
2. No Web Imóveis, a Avaliação Inteligente pertence exclusivamente à **etapa 8 (opcional) do mesmo popup de criação/edição de anúncio**. Não criar página independente. O anúncio pode ser publicado na etapa 7 sem avaliação.
3. No anúncio existente, o botão deve dizer **Avaliar**; mostrar histórico e permitir reavaliação.
4. Avaliações privadas, vinculadas ao anúncio, com histórico, amostras rastreáveis, opção de comparação com 2 ou mais anúncios (sem teto fixo de armazenamento, mas com paginação).
5. Comparáveis no mapa, seleção, tipos, atributos e deduplicação. Diferenciar coordenadas exatas/estimadas/inexistentes, nunca inventar localização. Evitar inferir área construída pela área útil ou área do terreno.
6. **Não gerar valores artificiais de mercado nem PTAM automaticamente** sem amostra válida, fundamentação e responsabilidade técnica.
7. Favorecer uso pelo smartphone; manter compatibilidade com desktop.
8. Segredos da GeckoAPI devem ficar apenas em variáveis protegidas da Vercel; nunca no GitHub ou no chat.
9. Antes de integrar dados externos comercialmente, investigar **licenças, termos dos portais e permissão de uso/redistribuição**, além do custo por requisição.

## 2. Arquitetura atual do laboratório

Aplicação com HTML, JS e Leaflet, mais função serverless na Vercel:

- `index.html`: interface responsiva, formulário por provedor, mapa, filtros, lista e comparador.
- `app.js`: normalização dos anúncios, cálculo de distância local, filtros, seleção e CSV. Não executa chamadas autenticadas diretamente ao fornecedor.
- `api/extract.js`: proxy POST autenticado; lê `GECKO_API_TOKEN` e `LAB_ACCESS_CODE` das variáveis de ambiente Vercel, valida solicitação e envia à GeckoAPI.
- `lib/geckoContracts.mjs`: adaptadores de parâmetros PLP/PDP por portal, auditoria de município e auditoria da URL da OLX.
- `scripts/test-lab.mjs`, `scripts/test-gecko-contracts.mjs`, `scripts/test-adapters.mjs`: testes sem usar créditos.
- `.github/workflows/test-lab.yml`: CI em cada commit.
- `COMO_USAR.md`: instruções de uso e configuração.

Comandos atuais:
```sh
npm run check
npm test
```

**IMPORTANTE:** buscar o estado atual do branch `main` e dos testes no GitHub antes de qualquer alteração. As funcionalidades mudam de commit para commit.

## 3. APIs de terceiros

Endpoint da GeckoAPI: `POST https://api.geckoapi.com.br/v1/extract`, com `Authorization: Bearer <TOKEN>` somente no backend.

Documentação oficial: https://geckoapi.com.br/docs/

Portais em teste:
- **OLX**: `olx.com.br`. PLP aceita `keyword`, `state`, `city`, `region`, `categoryPath`, `page`, valores e URL de pesquisa (que pode prevalecer sobre os demais filtros). PDP consulta URL individual.
- **ZAP Imóveis**: `zapimoveis.com.br`. PLP com cidade/UF, `businessType`, tipos e filtros estruturados; PDP com URL individual.
- **VivaReal**: `vivareal.com.br`. PLP aceita tipos, amenidades, coordenadas, filtros e eventualmente URL; detalhes podem representar preços em listas.
- **Chaves na Mão**: `chavesnamao.com.br`. PLP tem estruturas próprias (`prices.rawPrice`, `area.useful`, `counts.*` etc.).
- **Imovelweb**: `imovelweb.com.br`. Busca PLP por **URL de página de resultados terminada em `.html`**, com paginação conforme documentação; preço `price.amount` e características em `property.*`.

Nunca presumir que parâmetros, caminhos de categorias ou respostas são idênticos entre os cinco fornecedores. Quando houver defeito, consultar a documentação PLP/PDP específica e confrontar com o payload real e com a URL devolvida.

## 4. Histórico de testes (importante para continuidade)

### Korum
- Usuário experimentou Korum como referência de UX (mapa, seleção de amostras, exportação CSV/KML).
- Exemplo anterior: 23 anúncios em CSV e 24 pontos em KML (23 anúncios + imóvel avaliado), todos originados do Imovelweb.
- Amostra apresentou campos essenciais ausentes, coordenadas repetidas e mistura de imóveis de outros mercados; conclusões/preço sugerido não foram considerados avaliação homologada.
- Alguns arquivos/análises foram enviados apenas no chat e não necessariamente estão neste repositório.

### GeckoAPI/ZAP
- Uma busca PLP muito restrita retornou zero.
- A busca mais ampla em **Salto de Pirapora/SP** retornou **191 resultados totais anunciados pela fonte**, 30 na primeira página, com preço, área útil, dormitórios, suítes, fotos etc.
- Exemplo do ZAP: casa de 120 m² anunciada por R$ 385 mil; informações de terreno não vinham completas.
- PLP significa busca/listagem; PDP significa detalhes de anúncio.

### GeckoAPI/OLX
- Primeiro teste retornou 50 anúncios de municípios distintos, portanto inválidos para a avaliação local.
- A aplicação passou a rejeitar anúncios cuja cidade/UF não conferem com o município pesquisado.
- Usuário mostrou depois, no celular, **50 anúncios carregados de 377 indicados como total da fonte, e 0 anúncios com coordenadas**, com aviso de que a URL consultada contém estado/região/município. **O print não comprovou por si só quais eram as 50 cidades aceitas; conferir auditoria completa/CSV do teste**.
- Para Salto de Pirapora a OLX usa a rota pública `/imoveis/venda/casas/estado-sp/regiao-de-sorocaba/salto-de-pirapora`, e a API requer distinguir região da cidade. O laboratório ganhou referência à rota e diagnóstico da URL construída.
- Caso a OLX não retorne coordenadas, os imóveis aparecem na lista mas **não recebem marcadores geográficos falsos**.
- Não fazer consultas reais adicionais com créditos do usuário sem permissão.

## 5. Estratégia de produto que ainda está em análise

Objetivo de longo prazo: pesquisar imóveis em várias fontes (preferências por corretor), escolher área/raio do mapa, apresentar resultados por portal e tipologia, marcar comparáveis, enriquecer por PDP, deduplicar e comparar atributos fundamentais; futuramente aplicar metodologia estatística validada e relatórios apropriados.

Soluções pesquisadas como referência ou fornecedoras: Korum (busca/mapa), DataWarp (extração e estatística), Avalliemais (planilhas e metodologia), GeckoAPI (API JSON), além de outras. **Nenhuma licença SaaS/white-label e nenhum direito de republicação comercial desses dados foi confirmado**.

A consulta de fontes e a triagem devem ser independentes da metodologia final de avaliação. Garantir permissões contratuais para armazenamento, apresentação de informações e uso de imagens de portais.

## 6. Situação e próximos passos

- O laboratório está publicado em `https://imovel-busca.vercel.app/` e sua conexão GitHub–Vercel já foi reautorizada; antigo erro 403 foi resolvido.
- Existe um token GeckoAPI guardado na Vercel como variável `GECKO_API_TOKEN` e senha do laboratório em `LAB_ACCESS_CODE`. **Nunca recuperar nem exibir os valores.**
- Comparador, mapa, filtros, exportação CSV e chamadas PLP/PDP já existem experimentalmente.
- Revisar a qualidade dos resultados reais por município, deduplicação entre portais, tipologia e extração de áreas.
- Confirmar a aderência dos filtros nativos OLX ao município, validar URLs/retornos e diferenciar “portal ignorou filtro”, “ausência de coordenadas”, “sem anúncio” e “dados insuficientes”.
- Melhorar UX e cobertura antes de considerar aplicação no Web Imóveis.
- Testes automáticos e builds não substituem um teste real autorizado do fornecedor.
- Se precisar atualizar o Web Imóveis, primeiro ler `AGENTS.md` do repo de produção e confirmar autorização do usuário para cada etapa.

## 7. Como retomar em uma nova conversa

Copiar esta mensagem para uma nova conversa do ChatGPT ou Codex:

> Quero continuar o projeto **Imóvel Busca / Avaliação Inteligente do Web Imóveis**. Leia primeiro o arquivo `docs/CONTEXTO_DE_CONTINUIDADE.md` no repositório GitHub `serjaoberrantero1986/imovel-busca`, verifique o último commit, o CI e o deploy Vercel, e consulte `COMO_USAR.md`. O Web Imóveis fica em `serjaoberrantero1986/imovel-hub`, com regras em `AGENTS.md`; **não o altere** sem autorização. Diga o que está implementado e continue do ponto atual, priorizando a qualidade dos resultados reais da OLX/GeckoAPI.

O histórico de mensagens do ChatGPT pode ser útil, mas **este documento versionado e os arquivos reais dos repositórios são a referência durável**. Atualizar o documento ao concluir mudanças relevantes.

## 8. Rodada de triagem e reimportação — 2026-10-19

Nova etapa desenvolvida exclusivamente no repositório `imovel-busca`, na branch `feat/triagem-comparaveis-csv-20261019`, em PR de validação: https://github.com/serjaoberrantero1986/imovel-busca/pull/1

- Entradas: JSON PLP/PDP e importação local de CSV no formato exportado pelo próprio laboratório, inclusive versão antiga sem coluna `type`. Arquivos ficam no navegador (sem novo uso da GeckoAPI); limite atual de 3 MB e 2.000 anúncios por arquivo.
- A exportação CSV passa a conter `type` e protege textos contra injeção de fórmulas em planilhas.
- Tipologia estruturada da fonte tem prioridade sobre textos de bairro, para não interpretar `Casa em Chácaras Parque Pirapora` como propriedade rural. Em CSV legado, o prefixo explícito de URLs do VivaReal pode recuperar a tipologia, sem presumir outros atributos.
- Cada anúncio recebe triagem por integridade: `complete` (dados essenciais presentes), `review` (precisa de conferência) ou `insufficient` (faltam dados essenciais). **Não é verificação de autenticidade nem aprovação de comparável**.
- Preço pedido/m² é puramente descritivo; terreno usa área total, imóveis edificados usam área útil. Não existe estimativa automática de mercado/PTAM.
- Duplicidades potenciais exigem cidade, UF, bairro, tipologia e preço/área suficientemente próximos, com dormitórios coerentes quando informados. A detecção apenas sinaliza; não elimina anúncios.
- Comparador mostra advertências sobre dados insuficientes, diferentes municípios e tipos misturados.
- Amostra real de referência: CSV de quatro anúncios VivaReal em Salto de Pirapora/SP, com um imóvel sem coordenadas e alguns títulos genéricos no formato anterior. Esses resultados **não** compõem amostra validada para precificação.
- Nenhum arquivo em `imovel-hub` foi modificado e nenhuma consulta autenticada adicional à GeckoAPI foi feita.

**Próximas tarefas**: confirmar testes da PR e publicação Vercel; validar manualmente importação do CSV real no navegador; confirmar com o usuário o recorte de tipologia, região, atributos e imóvel avaliado antes de construir indicadores estatísticos, metodologia e futuras integrações no SaaS principal. Não declarar avaliações reais sem validação técnica.

## 9. Cadastro livre de imóvel de referência — 2026-10-19

Implementação no laboratório independente, branch `feat/referencia-multitipologia-20261019`, iniciada após o usuário confirmar que deseja cadastrar **qualquer tipo de imóvel**.

- Formulário responsivo com 12 tipos nomeados e `other` (descrição livre), município/UF, bairro, área útil, construída e total/terreno separadas, dormitórios, suítes, banheiros, vagas e geolocalização opcional.
- Triagem de semelhança por critérios explícitos: tipologia e município incompatíveis geram `incompatible`; falta de atributos essenciais gera `insufficient`; diferenças de metragem, bairro, subtipo, quantidades ou distância geram `review`; somente critérios efetivamente confirmados geram `compatible`.
- Área de comparação: `total` para terrenos e imóveis rurais; `usable` para demais. A metragem construída `built` não é convertida em útil e sua ausência nos fornecedores não é presumida.
- Tolerância de área padrão ±20%, configurável de 5% a 50%, **como recurso de triagem exploratória**, sem fundamentação estatística ou nota de avaliação.
- Coordenadas de referência podem ser informadas, mas não geocodificadas automaticamente; marcador próprio no mapa, raio opcional e distinção explícita de anúncios sem coordenadas.
- Filtros por estado da triagem, ordenação conservadora, etiquetas e razões em cada card, alertas no comparador, exportação CSV com dados da referência e motivos para revisão.
- Campo `Outro tipo` permite livre cadastramento, mas a equivalência de tipo personalizado não é julgada automaticamente; precisa de validação humana.
- Cadastro efêmero na aba; sem Supabase e sem persistência, sem uso de créditos GeckoAPI. Não alterar `imovel-hub` sem autorização específica.

**Limites**: conferir finalidade da oferta (venda/locação), situação de mercado, conservação, documentação, recorte temporal, amostragem e direitos de dados antes de transformar essa triagem em avaliação. Não chamar `compatible` de comparável aprovado ou gerar PTAM sem metodologia e responsabilidade técnica.

## 10. Simplificação guiada — feedback do usuário em 2026-10-19

Após cadastrar `Casa Ana Guilherme` e exportar três anúncios selecionados, o usuário relatou que a interface estava cheia de informações e que não entendia como analisar o imóvel.

**Evidência concreta do CSV enviado no chat:** os três anúncios selecionados são casas em Salto de Pirapora/SP; valores anunciados R$ 240.000 (119 m² úteis, 2 dormitórios), R$ 270.000 (100 m² úteis, 2 dormitórios) e R$ 385.000 (120 m² úteis, 3 dormitórios). A referência foi cadastrada com 3 dormitórios, 1 suíte, 2 banheiros, 2 vagas e **sem `ref_area_m2`**. Os três `ref_status` eram `insufficient` devido à falta da área útil do imóvel de referência. A diferença de dormitórios, suítes, banheiros e vagas permanecia como motivo de revisão. Os preços pedidos não sustentam avaliação financeira.

**Alteração:** reorganizar laboratório em três etapas visíveis — (1) cadastrar referência com destaque à metragem principal; (2) importar CSV por padrão, com JSON/API como opção técnica; (3) ler orientação e resumo legível dos anúncios escolhidos. Mapa, filtros extensos, auditoria e tabela detalhada continuam acessíveis, porém recolhidos por padrão. Aviso claro sobre área ausente, sem gerar preços artificiais. Documentação e testes verificam que IDs funcionais não foram perdidos.

**Restrições:** mudar somente `imovel-busca`. Não consultar GeckoAPI com créditos e não editar `imovel-hub`. As melhorias devem ser validadas no CI e na Vercel.

## 11. Substituição do fundo cartográfico após HTTP 403 — 2026-10-20

Imagem enviada pelo usuário mostrou `Access blocked` em todos os tiles da OpenStreetMap Foundation, enquanto marcadores e círculo Leaflet continuavam visíveis. A causa é o bloqueio/política de uso do servidor gratuito de tiles, não os dados dos comparáveis nem a GeckoAPI.

A branch `fix/openfreemap-basemap-20261020` substitui exclusivamente o **basemap**: integra OpenFreeMap Positron (vetorial) via MapLibre GL JS e adaptador Leaflet, com atribuição visível e aviso quando a camada não carrega. O objetivo é preservar Leaflet, IDs da UI, marcadores, centro arrastável, raios, distâncias, seleção e CSV. Não usar outros domínios OSMF como forma de contornar bloqueio. Documentação do fornecedor: https://openfreemap.org/quick_start/ (uso comercial permitido, sem chave de API, sem SLA). Para escala/garantias comerciais, considerar tiles próprios ou fornecedor contratado.

CSV real do usuário: três registros selecionados, dois geolocalizados e um sem coordenadas. `ref_area_m2=110` e `ref_status=review` para os três imóveis da Casa Ana Guilherme. Nenhuma consulta autenticada adicional à GeckoAPI, nem mudança em `imovel-hub`.
