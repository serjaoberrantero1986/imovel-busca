# Imóvel Busca — laboratório independente
Este repositório **não** conecta ao Web Imóveis, Supabase ou domínio de produção. Não contém anúncios fictícios e não calcula valor de mercado/PTAM.

## Pesquisa mista — escolha uma, várias ou até cinco fontes

Na aba **Buscar pela GeckoAPI (avançado)**, em **Buscar lista (PLP)**, marque **Pesquisar em várias fontes de uma vez**. O formulário passa a oferecer as fontes **ZAP Imóveis, VivaReal, OLX, Chaves na Mão e Imovelweb**. Você pode marcar uma ou várias. **Selecionar 4 fontes sem URL** marca ZAP, VivaReal, OLX e Chaves; **Selecionar as 5 fontes** inclui também o Imovelweb, que exige informar uma **URL HTTPS pública de resultados terminada em .html**. Sem essa URL, o botão de pesquisa não realiza as consultas e informa o motivo.

1. Cadastre seu imóvel de referência na etapa 1 e abra a aba de busca. Opcionalmente clique **Preencher localização e características usando meu imóvel**: cidade, UF, tipologia, bairro e dormitórios são reaproveitados como ponto de partida. Para imóveis edificados, a faixa de **área útil** é derivada da tolerância já configurada. Para terrenos/imóveis rurais não inferimos área útil a partir do terreno; revise os filtros separadamente.
2. Escolha uma ou mais fontes, informe cidade/UF e demais filtros, selecione a página (uma página por fonte) e confira o aviso de **até N chamadas**. A API de cada fonte tem seu próprio contrato: os filtros não são idênticos em todos os sites. A OLX usa categoria, região e palavra-chave e pode exigir revisão mais cuidadosa da tipologia; o Imovelweb consulta apenas a URL fornecida. Contagens mínimas de dormitórios/banheiros/vagas e outras restrições podem ser aplicadas **somente na lista local**. A consulta de raio geográfico da API permanece disponível em modo de portal único.
3. Informe o código de acesso do laboratório e clique **Consultar API (consome créditos)**. Confirme conscientemente o número de consultas e fontes; cada portal selecionado é consultado **uma vez por execução**, em sequência, através do proxy já protegido, sem tentar novamente uma falha automaticamente. O servidor limita requisições; erros 401/429/503 interrompem as chamadas seguintes para evitar desperdício.
4. Acompanhe o resumo individual por fonte: anúncios aproveitados pela checagem de município/UF, descartados e eventuais falhas, com ID de consulta disponível quando fornecido. O sistema reúne todos os anúncios na mesma lista, sem exigir CSV, mantendo origem e identificador. Totais de resultados reportados pelas fontes **não são somados** como se fossem imóveis distintos.
5. Confira anúncios repetidos em diferentes portais e as características individuais antes de selecioná-los como comparáveis. No **indicativo preliminar de ofertas**, suspeitas conservadoras de duplicação entre fontes (mesmo município/UF, bairro, tipologia, preço e área próximos e características não conflitantes) são **excluídas preventivamente somente do cálculo**, mas preservadas na lista com explicação — não é prova de que sejam o mesmo imóvel. Você pode selecionar outra oferta após verificação manual. Identidades exatas são igualmente desconsideradas em dobro.
6. Se desejar guardar os dados, use **Exportar CSV (opcional)**: a exportação mantém fonte, ID, URL, data/hora de coleta, IDs de consulta/execução, filtros enviados (sem senha/token) e classificação comparativa. O CSV antigo continua importável. Data de coleta **não é data de publicação do anúncio**.

A pesquisa mista **não dispensa verificação profissional**, não identifica de forma conclusiva duplicidades, não prova que as fontes tenham aplicado todos os filtros e não produz PTAM. A etapa posterior de parecer técnico precisará de evidências preservadas, critérios de aceitação documentados, tratamento técnico, revisão e assinatura por profissional habilitado. **Nenhum teste automatizado deve chamar a GeckoAPI real com token/custo.**

## Valor preliminar na tela — sem obrigatoriedade de CSV

Depois de salvar o imóvel de referência e selecionar **ao menos dois anúncios**, a etapa **3. Veja seu indicativo de valor** passa a mostrar **imediatamente** um indicador numérico, uma faixa e os alertas de confiabilidade. O botão de exportação CSV continua opcional.

### Metodologia exploratória (não é avaliação mercadológica)

1. Exigir tipologia e município/UF correspondentes, preço pedido positivo, área útil (imóveis edificados) ou área total de terreno (terrenos e imóveis rurais), tolerância de metragem definida e referências que não estejam incompletas nem incompatíveis. Excluir anúncios explicitamente identificados como aluguel.
2. Cada anúncio aproveitável gera um preço **anunciado por m²** = preço pedido / área pertinente. Não há ajuste arbitrário de número de quartos, bairro, conservação, condição negocial ou terreno entre imóveis edificados; essas divergências são avisadas.
3. **Indicativo** = mediana dos preços anunciados/m² × metragem da referência. **Faixa observada** = mínimo e máximo desses preços por m² projetados na mesma área. A faixa **não é** um intervalo de confiança estatístico; não há tratamento por fatores conforme NBR 14653 ou inferência estatística neste MVP.
4. A tela discrimina anúncios selecionados, incluídos, excluídos, motivo da exclusão e cálculo detalhado por comparável. Sem referência, metragem ou ao menos 2 anúncios válidos, não exibe número (nunca exibe zero arbitrário). Menos de 5 anúncios recebe aviso **amostra pequena / confiabilidade baixa**. Com mais anúncios, o status continua **limitado** devido aos dados de oferta não homogeneizados.
5. Alguns imóveis podem compartilhar atributos ou links. Identidades exatas são excluídas do cálculo; na pesquisa mista, suspeitas conservadoras de duplicação entre portais também são excluídas **preventivamente do indicativo**, sem apagar os registros e sem afirmar que sejam a mesma unidade. A decisão final sobre duplicidade requer revisão humana.

**Exemplo real fornecido pelo usuário:** Casa Ana Guilherme, casa com **110 m² úteis** em Salto de Pirapora/SP. Três casas anunciadas por R$240.000 (119 m²), R$270.000 (100 m²) e R$385.000 (120 m²). Os preços pedidos/m² são R$2.016,81, R$2.700,00 e R$3.208,33; o indicativo baseado na mediana é **R$297.000**, com faixa observada projetada de **R$222 mil a R$353 mil**, sem ajustes por dormitórios, suítes, vagas ou bairro. **Não** comunicar como valor de mercado concluído.

Uma avaliação mercadológica formal (como PTAM) requer caracterização, fontes documentadas, metodologia apropriada, homogeneização e responsabilidade profissional (Resolução COFECI 1.066/2007). Para o método comparativo direto conforme ABNT NBR 14653, é necessária amostra representativa e tratamento adequado; o algoritmo simples acima **não** a substitui.

## Guia rápido — três etapas, sem laudo automático

**O Imóvel Busca pesquisa e ajuda a escolher comparáveis; agora calcula um indicativo preliminar de ofertas na tela, mas ainda NÃO calcula valor de mercado tecnicamente validado nem um PTAM.**

1. **Descreva o imóvel que deseja avaliar**. Escolha tipologia, cidade e UF e informe a metragem principal: **área útil/privativa para casas, apartamentos e unidades edificadas**; **área do terreno para terrenos, chácaras e sítios**. Informe dormitórios se conhecidos. Outros atributos estão recolhidos em **Adicionar mais características**.
2. **Adicione anúncios semelhantes**. Para reutilizar uma pesquisa, escolha o CSV exportado anteriormente e clique **Importar meus anúncios** (sem consumo de créditos). A importação JSON fica recolhida; a busca GeckoAPI está em uma aba claramente identificada como avançada e pede confirmação para gastar créditos.
3. **Veja seu indicativo de valor**. Marque **Comparar** nos anúncios, com ao menos dois aproveitáveis. A tela mostra automaticamente um indicativo baseado em preços anunciados, a faixa observada, os anúncios escolhidos e divergências frente à referência. O aviso **Próximo passo** orienta o que falta — inclusive quando a metragem principal não foi cadastrada. O botão de exportação permanece visível; mapa, filtros extensos, auditoria e tabela completa ficam disponíveis em painéis opcionais.

**Caso real:** o usuário exportou três casas de Salto de Pirapora para a referência `Casa Ana Guilherme`, mas sem informar a **área útil** dessa casa. O resultado era `insufficient` para todos. A interface guiada explica diretamente qual campo precisa ser preenchido e mostra as diferenças de quartos, suítes, banheiros e vagas, sem apresentar isso como cálculo do valor do imóvel.

Os valores em R$/m² representam somente **preços pedidos nos anúncios**. Antes de qualquer avaliação técnica, ainda é necessário verificar características, qualidade das fontes, padronização da amostra, finalidade das ofertas e metodologia aplicável. Limpar anúncios não apaga automaticamente o imóvel de referência; este continua apenas na sessão atual.

## O que funciona sem chave
1. Abra **Importar arquivo** e cole o resultado PLP/PDP fornecido pela GeckoAPI **ou** selecione um CSV anteriormente exportado pelo Imóvel Busca e clique **Importar meus anúncios**. Nenhuma das duas ações consome créditos.
2. Observe a triagem dos anúncios: **dados essenciais completos**, **requer conferência** ou **dados insuficientes**. A triagem verifica presença/coerência de campos, não comprova origem, veracidade ou homogeneidade.
3. Veja no mapa somente os anúncios com coordenadas; posição aproximada é sinalizada. Anúncios sem coordenadas continuam na lista.
4. Ajuste o centro e raio do mapa, filtros de atributos e **triagem dos dados**. A indicação de possíveis duplicidades é informativa, não remove anúncios.
5. Selecione 2 ou mais anúncios para comparar. A tabela mostra preço pedido, preço pedido/m² da área de referência e advertências quando existem dados insuficientes, cidades ou tipologias misturadas.
6. Exporte somente os anúncios selecionados como CSV; a exportação nova inclui a coluna de tipologia (`type`). CSVs exportados anteriormente, sem essa coluna, continuam aceitos; o tipo só é recuperado quando estiver explicitamente identificável (por exemplo no prefixo de URL do VivaReal).
O número totalResults do fornecedor representa o total reportado; não significa que todas as páginas já foram carregadas. Os resultados não são persistidos no servidor. A importação CSV aceita somente o formato de exportação do laboratório (até 3 MB / 2.000 anúncios) e ocorre localmente no navegador. **O preço anunciado/m² não é uma avaliação e não equivale a preço de transação.**

## Cadastro livre de imóvel de referência (triagem de semelhança)

A seção **Imóvel de referência** aceita casas, sobrados, apartamentos, kitnets, flats, coberturas, imóveis em condomínio, terrenos, chácaras/sítios/fazendas, salas e pontos comerciais, galpões e a opção **Outro tipo** com descrição livre. O cadastro fica **apenas na memória da aba atual**; não grava no banco, não muda anúncios do SaaS principal e não demanda a GeckoAPI.

1. Preencha tipo, município e UF. Identificação, bairro e demais atributos são opcionais. Para uma comparação de metragem efetiva, informe **área total de terreno** para terrenos e imóveis rurais e **área útil/privativa** para os demais; área construída é guardada separadamente e **não substitui área útil**. A triagem de um imóvel sem essa área de referência fica incompleta.
2. Opcionalmente informe dormitórios, suítes, banheiros, vagas, tolerância de área (5% a 50%; sugestão inicial da interface: **±20%**) e, somente se conhecidas, latitude/longitude. Um raio geográfico requer **ambas** as coordenadas; nenhum ponto ou localização é inventado.
3. Clique **Salvar imóvel de referência**. A lista e o comparador passam a classificar cada anúncio em quatro categorias: **aderente nos critérios conferidos**, **revisar diferenças**, **comparação incompleta** e **fora do recorte**. Município/UF ou tipologia verificadamente diferentes ficam fora do recorte; falta de cidade, tipo, preço pedido ou da área de referência impede conclusão de aderência.
4. Filtre pelos estados de triagem ou ordene os resultados pela aderência. Anúncios não são removidos automaticamente: mesmo um anúncio fora do recorte continua selecionável para auditoria. O relatório comparativo exibe alertas e o CSV acrescenta os dados e motivos da classificação vigente.
5. O indicador usa **regras heurísticas explícitas e revisáveis**, e não oferece pontuação financeira, avaliação automática, valor de mercado nem PTAM. Não há homologação da semelhança, estado de conservação, qualidade dos dados, natureza da oferta (venda/locação), negociação, documentação ou licenças do fornecedor. Imóveis de **tipologia personalizada** exigem validação humana.

O marcador **R** só aparece quando as coordenadas de referência foram informadas pelo usuário; o círculo e centro visual do mapa continuam independentes. Ao limpar apenas a referência, os anúncios e a seleção são preservados. O CSV registra a referência da **sessão no momento da exportação**, mas importar o CSV não recria automaticamente o cadastro, evitando assumir que a referência histórica ainda é válida.

## Versão 0.2 — escolha de portais e comparador
Aba **Consultar GeckoAPI**:
1. Selecione **Buscar lista (PLP)**.
2. Em **Portal**, escolha uma fonte para pesquisa única **ou** marque **Pesquisar em várias fontes de uma vez** para selecionar uma a cinco; para incluir Imovelweb na pesquisa mista, a URL pública .html é obrigatória.
3. Para ZAP, VivaReal e Chaves na Mão, informe cidade/UF e opcionalmente tipo, bairro, preço, área útil e uma busca por coordenadas. O servidor transmite os filtros estruturados suportados. Na busca por coordenadas, a GeckoAPI usa **2 km fixos** — não confunda com o raio visual de 1–50 km.
4. Para OLX, informe cidade/UF, escolha **Casa** (ou outro tipo), e consulte. O servidor usa categoria e busca textual; para **casas à venda** utiliza o caminho OLX observado em testes. Isso não garante que a fonte respeitou município ou tipologia, que precisam ser auditados na resposta. Se quiser reproduzir os filtros do próprio portal, cole uma URL de resultado da OLX no campo correspondente; a URL terá prioridade.
5. Para Imovelweb, forneça URL HTTPS de uma **página de resultados** do Imovelweb; a API não recebe filtros estruturados nessa modalidade.
6. Clique **Consultar API** e confirme o consumo de créditos. Páginas seguintes podem ser buscadas ajustando o número da página.
7. Filtre a lista pela tipologia identificada, bairro, preço, área útil, dormitórios, banheiros e vagas. Marcadores acompanham o filtro local. Imóveis sem coordenadas continuam na lista, não recebem um pino inventado.
8. Clique **Buscar detalhes (PDP)** num anúncio para consultar sua ficha individual. Essa consulta também pode consumir créditos; confirme antes de executar. A ficha pode preencher novas informações disponíveis, sem presumir atributos ausentes.
9. Selecione pelo menos dois anúncios e exporte seu CSV.

**Atenção**: a seleção de outro portal não exclui as consultas anteriores: resultados são acumulados por identificador de fonte, permitindo comparar OLX e ZAP. Use **Limpar sessão** para começar do zero. A existência de links, fotos e dados disponíveis tecnicamente não implica autorização de redistribuição comercial.

## Habilitar consultas PLP/PDP
No projeto **imovel-busca** da Vercel, em Settings → Environment Variables, crie:
- GECKO_API_TOKEN: token de API da GeckoAPI, como variável Sensitive/Encrypted.
- LAB_ACCESS_CODE: código de acesso forte e exclusivo do laboratório (não reutilize senha de serviços), como variável Sensitive/Encrypted.

Ative-as para o ambiente Production e execute Redeploy após salvar. Nunca adicione valores reais no GitHub, em capturas de tela ou nesta conversa.

Para testar: abra Consultar GeckoAPI, preencha cidade e UF (PLP) ou URL (PDP), informe o código de laboratório e confirme o consumo de créditos. Não preencha o campo do código com o token GeckoAPI; o token pertence só à Vercel.

## Segurança e limitações
- Sem credenciais na Vercel, a consulta retorna HTTP 503; importação JSON permanece disponível.
- O campo de código de acesso é enviado ao servidor por HTTPS e não é guardado em armazenamento local pelo aplicativo.
- Função serverless valida operação e domínios, aplica tempo limite e contém limitador básico em memória (não adequado a ataques distribuídos ou muitos usuários).
- O site pode ser acessível publicamente dependendo das proteções configuradas na Vercel. Não insira dados confidenciais nas caixas de importação.
- O mapa usa **OpenFreeMap** (estilo vetorial Positron) por meio de **MapLibre GL JS** e adaptador Leaflet, preservando marcadores, comparação geográfica e interações anteriores. Isso substitui as requisições diretas aos tiles públicos da OpenStreetMap Foundation, que estavam bloqueadas com HTTP 403 no laboratório.
- O OpenFreeMap permite uso comercial sem chave de API, conforme documentação do fornecedor: https://openfreemap.org/quick_start/ e https://openfreemap.org/. Os créditos cartográficos OpenStreetMap/OpenMapTiles/OpenFreeMap são exibidos no mapa. O serviço público **não oferece SLA**; para uso comercial com garantias, avaliar infraestrutura própria ou contrato com provedor dedicado.
- Se as bibliotecas MapLibre ou o serviço de estilo ficarem indisponíveis, a aplicação exibe aviso no mapa sem apagar os anúncios, os comparáveis ou o CSV. Se houver problema de carregamento, atualize a página sem limpar os dados da sessão; recarregar pode apagar a sessão, pois não existe persistência.
- usableAreas e totalAreas são separados; campo ausente nunca é convertido automaticamente em metragem presumida.
- Não certifica coordenadas nem deduplica automaticamente anúncios de fontes diferentes. Apenas sinaliza possíveis coincidências por município, UF, bairro, tipologia, valor e área próximos; a decisão de excluir duplicados é humana.
- Dados essenciais completos **não significam comparável aprovado**. A classificação não prova homogeneidade, conservação, documentação ou validade dos anúncios; informações ausentes nunca são inferidas de outras metragens.
- A saída CSV protege campos textuais contra fórmulas ao abrir em planilhas; trate os dados importados como não confiáveis.
- Os portais podem fornecer informações incompletas ou variar o esquema; testar cobertura e revisar cada amostra.
- Consultas podem consumir créditos; este software não controla saldo nem orçamento persistente.
- O código de integração não concede licença para republicar conteúdo de portais. Validar autorizações e contrato B2B antes de qualquer uso comercial.

## Desenvolvimento
Node 20+. A aplicação usa HTML/JS sem etapa de build e uma função Node em api/extract.js. npm run check faz verificação sintática de arquivos JS.

## Correção dos mapas bloqueados (20/10/2026)

O erro visual `403 Access blocked / tile usage policy` é retornado pelos **servidores de imagens** da OpenStreetMap Foundation, e não pela API de imóveis. Os anúncios e coordenadas não são a causa do bloqueio. O projeto agora usa mapas vetoriais do OpenFreeMap e mostra aviso quando não consegue carregar o fundo cartográfico. **Não** tente resolver alternando para outros subdomínios `a.tile.openstreetmap.org`, `b.tile.openstreetmap.org`, usando proxy para contornar o bloqueio, nem removendo atribuição.

No CSV de teste `comparaveis-imovel-busca (3).csv` de três anúncios selecionados para **Casa Ana Guilherme**, os dois primeiros possuem coordenadas `-23.615262,-47.565947` e `-23.666246,-47.588038` e o terceiro não possui coordenadas. A referência foi cadastrada com **110 m² úteis**; todos os anúncios ficaram classificados como `review`, não como `insufficient` nem como estimativa de preço. A ausência de coordenadas impede o marcador do terceiro, mas não impede sua comparação.
