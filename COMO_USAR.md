# Imóvel Busca — laboratório independente
Este repositório **não** conecta ao Web Imóveis, Supabase ou domínio de produção. Não contém anúncios fictícios e não calcula valor de mercado/PTAM.

## O que funciona sem chave
1. Abra **Importar JSON** e cole o resultado PLP/PDP fornecido pela GeckoAPI **ou** selecione um CSV anteriormente exportado pelo Imóvel Busca e clique **Importar CSV**. Nenhuma das duas ações consome créditos.
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
2. Em **Portal**, escolha **ZAP Imóveis, OLX, VivaReal, Chaves na Mão ou Imovelweb**.
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
- O navegador consulta tiles do OpenStreetMap. Para produção comercial e alto tráfego é necessário provedor de mapas apropriado.
- usableAreas e totalAreas são separados; campo ausente nunca é convertido automaticamente em metragem presumida.
- Não certifica coordenadas nem deduplica automaticamente anúncios de fontes diferentes. Apenas sinaliza possíveis coincidências por município, UF, bairro, tipologia, valor e área próximos; a decisão de excluir duplicados é humana.
- Dados essenciais completos **não significam comparável aprovado**. A classificação não prova homogeneidade, conservação, documentação ou validade dos anúncios; informações ausentes nunca são inferidas de outras metragens.
- A saída CSV protege campos textuais contra fórmulas ao abrir em planilhas; trate os dados importados como não confiáveis.
- Os portais podem fornecer informações incompletas ou variar o esquema; testar cobertura e revisar cada amostra.
- Consultas podem consumir créditos; este software não controla saldo nem orçamento persistente.
- O código de integração não concede licença para republicar conteúdo de portais. Validar autorizações e contrato B2B antes de qualquer uso comercial.

## Desenvolvimento
Node 20+. A aplicação usa HTML/JS sem etapa de build e uma função Node em api/extract.js. npm run check faz verificação sintática de arquivos JS.
