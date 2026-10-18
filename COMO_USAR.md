# Imóvel Busca — laboratório independente
Este repositório **não** conecta ao Web Imóveis, Supabase ou domínio de produção. Não contém anúncios fictícios e não calcula valor de mercado/PTAM.

## O que funciona sem chave
1. Acesse o site publicado e escolha **Importar JSON**.
2. Cole o resultado PLP fornecido pela GeckoAPI (data.items).
3. Visualize no mapa os anúncios que tenham coordenadas, com aviso quando a localização for aproximada.
4. Arraste o marcador central para deslocar o raio, altere seu tamanho, filtre anúncios e selecione 2 ou mais para comparação.
5. Exporte somente os anúncios selecionados como CSV.
O número totalResults do fornecedor representa o total reportado; não significa que todas as páginas já foram carregadas. Os resultados não são persistidos no servidor.

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
- Não certifica coordenadas nem deduplica automaticamente anúncios de fontes diferentes. Apenas sinaliza coincidências fortes quando o filtro de duplicidades está ligado.
- Os portais podem fornecer informações incompletas ou variar o esquema; testar cobertura e revisar cada amostra.
- Consultas podem consumir créditos; este software não controla saldo nem orçamento persistente.
- O código de integração não concede licença para republicar conteúdo de portais. Validar autorizações e contrato B2B antes de qualquer uso comercial.

## Desenvolvimento
Node 20+. A aplicação usa HTML/JS sem etapa de build e uma função Node em api/extract.js. npm run check faz verificação sintática de arquivos JS.
