# H&F — Controle de estoque

Aplicação web em português para analisar documentos, conciliar movimentações e exportar relatórios de Dry Snuff e Mapacho Rolls. Implementada com Next.js, React e TypeScript; preparada para GitHub, Vercel e PostgreSQL.

## Começar

Requer Node.js 22. Instale e execute:

```sh
npm ci
npm run dev
```

Abra http://127.0.0.1:3000. Neste computador, também é possível executar `iniciar.ps1` pelo PowerShell. O script procura o Node instalado e o runtime disponível na pasta `.tools` do diretório pai.

A aplicação abre em **Importar dados para análise**, sem registros de demonstração. Envie os arquivos ou marque **Arquivo não disponível**, informe o estoque inicial se ele não existir no histórico e confira o checklist. O processamento encaminha registros duvidosos para **Revisar dados**. Somente registros confirmados participam dos relatórios. O pacote de código não inclui documentos privados.

## O que está implementado

- **Validar e verificar tudo**: executa em um clique as verificações de todos os anos e produtos, incluindo campos, pesos, duplicidades, pares de entrada, gramaturas da Flórida, estoque e integridade SHA-256 dos novos arquivos. O histórico fornecido é aceito como correto e não é conferido. Exibe um resumo com acesso aos registros e guarda a última execução na auditoria. Não altera lançamentos nem substitui a confirmação do checklist; indica quando o resultado ficou desatualizado após uma alteração.
- Upload em lote de XLSX, CSV e PDF, com até 3 MB por arquivo e 40 páginas por PDF.
- Leitura das oito abas da estrutura histórica enviada; blocos de Mapacho e células mescladas são reconhecidos. As abas históricas são reproduzidas na tela Histórico original e no Excel completo, sem corrigir valores.
- Documentos originais preservados, SHA-256, identificação de arquivo repetido, origem por aba/linha ou página.
- PDF com extração de texto; OCR em inglês somente nas páginas sem texto suficiente. OCR executado no navegador usando arquivos locais da aplicação; o conteúdo do PDF não é enviado a serviços de OCR.
- Cadastro de produtos e mapeamento persistente por SKU, incluindo gramaturas explícitas nos nomes.
- Conflitos e possíveis duplicidades entre documentos mantidos fora dos cálculos até conciliação. Na conciliação, os documentos ficam vinculados a um registro; a decisão sobre peso e data é explícita e auditada.
- Dry Snuff e Mapacho sempre separados, novos pesos calculados por unidades × gramas ÷ 1000 e LB por 2.20462262185. Exemplo: 5 × 250g = 1,25 KG = 2,756 LB (exibição). KG e LB do histórico permanecem como enviados.
- Saídas, entradas, balanço, Flórida, resumo mensal, dashboard, revisão, produtos, fontes e configurações.
- Resumo com continuidade de estoque, recálculo retroativo e composição dos valores. Contagens no meio de um mês são identificadas como período parcial; saldo sem contagem fica desconhecido.
- Saídas de atacado, sites e perdas separadas; regra Crypto configurável para futuras importações.
- Exportação CSV por relatório e XLSX completo, com observações de incompletude e auditoria.
- Histórico de correções com antes/depois, justificativa e restauração de alterações simples para nova revisão.
- Autenticação por senha do espaço em produção e downloads autorizados de documentos, sem URLs públicas dos arquivos.

## Limites de interpretação

Os parsers são conservadores: um layout de invoice ou exportação desconhecido pode exigir correção manual. No layout SKU / ACTIVITY / QTY / RATE / AMOUNT, QTY é a quantidade e as datas seguem MM/DD/AAAA. OCR e formatos desconhecidos continuam sujeitos a conferência. Campos ausentes nunca são preenchidos por suposição.

As abas históricas agregadas são fontes de valores originais: nenhuma comparação, correção de conversão ou revisão é realizada. Os fechamentos históricos são usados como ponto de partida para os meses seguintes. Novos documentos ainda são comparados aos registros anteriores para evitar duplicar estoque; só o novo registro fica para conciliação. O arquivo original completo permanece disponível para download.

Estados de entrega americanos são exibidos em siglas; estado ausente fica “Não identificado” e país de destino fora dos EUA fica “Exterior”. País de origem e endereço de cobrança não definem o destino.

As novas vendas da Flórida sem quantidade/gramatura ficam sinalizadas e não entram no total calculado por embalagem. Resumo e balanço mantêm a integridade do estoque completo; filtros por cliente, estado, site, canal e origem se aplicam às tabelas de movimentações e Flórida. Produtos ignorados no cadastro não geram movimento confirmado.

Não há conectores automáticos ativos. `SourceAdapter` e `ManualUploadAdapter` definem o contrato para conectar fontes futuras quando suas APIs e permissões forem conhecidas. Não foram inventados acessos a Sacred, Haux Haux ou Natural Medicine.

## Dados locais e produção

Em desenvolvimento, os dados ficam **no servidor**, em `.data/state.json`, com documentos em `.data/documents`. O navegador não é o banco de dados. Essa pasta é ignorada pelo Git. Copie a pasta inteira para um backup local quando necessário.

Em produção, `DATABASE_URL` é obrigatório. A aplicação não permite usar disco temporário da Vercel como banco. PostgreSQL armazena o estado auditável e os arquivos privados; a atualização do estado usa transação e bloqueio de linha para impedir sobrescritas concorrentes. A versão enviada pelo cliente também é conferida. As entidades de documentos, produtos, movimentos, importações e correções são estruturas JSONB versionadas; não há tabelas relacionais independentes para cada entidade nesta versão. Essa solução destina-se inicialmente a um único espaço da empresa e volumes moderados. Para alto volume, evolua os repositórios para tabelas normalizadas e armazenamento privado de objetos.

O armazenamento PostgreSQL foi conectado ao Supabase com TLS verificado. Na publicação Vercel, foram conferidos o login, a leitura do estado copiado, o download protegido dos documentos, a exportação Excel com as abas históricas e a interface em tela de celular. Essa verificação não altera os dados nem recalcula o histórico. Os testes que criam registros fictícios continuam restritos ao repositório local isolado.

## Publicar com GitHub + Vercel + Supabase

1. Crie um repositório privado no GitHub e envie esta pasta. Não envie `.data`, `.env.local`, documentos de clientes, `node_modules` ou `.next`.
2. No projeto Supabase, abra **Connect → Transaction pooler** e use a URL exata apresentada, com a senha do banco e TLS. Essa conexão usa a porta 6543; o código já desativa prepared statements (`prepare: false`). Use a conta proprietária do banco: a inicialização cria as tabelas e ativa Row Level Security dentro de uma transação. As tabelas não têm políticas para clientes da API pública; o acesso ocorre pelo servidor autenticado da aplicação. Não use a chave pública `anon` como URL do banco. Referências: [conexão PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres) e [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
3. Importe o repositório na Vercel como projeto Next.js. Use Node.js 22, `npm ci` e `npm run build`.
4. Configure as variáveis da `.env.example` nas configurações do projeto:
   - `DATABASE_URL`: URL PostgreSQL do provedor, preferencialmente com pool e SSL.
   - `DATABASE_SSL_CA`: conteúdo PEM do certificado raiz baixado em Database Settings no Supabase. Use `sslmode=verify-full` na URL; o servidor valida o certificado e o nome do banco. Aceita quebras de linha reais ou `\n`.
   - `APP_PASSWORD`: senha forte do espaço, com pelo menos 12 caracteres.
   - `SESSION_SECRET`: segredo aleatório de pelo menos 32 caracteres.
   - `APP_ORIGIN`: origem HTTPS exata da aplicação, sem barra final, por exemplo `https://seu-projeto.vercel.app`.
5. Publique e faça login. Faça a importação dos documentos pela interface. A instalação baixa o modelo público de OCR em inglês; nenhum documento da empresa é necessário no build.

Uma alteração de domínio exige atualizar `APP_ORIGIN`. O acesso é compartilhado por senha do espaço, não um sistema de usuários individuais. Há limitação básica de tentativas por instância; para implantação exposta em larga escala, adicione o rate limiting distribuído do provedor ou substitua por autenticação gerenciada. As sessões expiram após 12 horas. Os documentos são enviados ao PostgreSQL privado e só podem ser baixados por uma sessão autenticada.

## Estrutura

```text
src/app/             Página, estilos e rotas autenticadas
src/components/      Importação, revisão, relatórios e configurações
src/lib/model.ts     Entidades e constantes
src/lib/domain.ts    Validação, conciliação e estoque
src/lib/parsers.ts   XLSX, CSV, histórico e texto de PDF
src/lib/pdf-client.ts Extração de PDF e OCR no navegador
src/lib/reports.ts   Composição de relatórios e filtros
src/lib/adapters.ts  Contrato de conectores
src/server/          Autenticação, persistência e ações auditadas
tests/               Testes das regras de negócio
scripts/             Assets e verificações de integração/navegador
```

## Verificações

```sh
npm test
npm run check
npm run build
```

O script `browser-check.mjs` usa Chrome headless para verificar a interface em http://127.0.0.1:3000. `integration-check.mjs` exige uma instância isolada vazia na porta 3001, com `HF_LOCAL_DATA_DIR=.data-qa` e `HF_BUILD_DIR=.next-qa`; ele importa dados fictícios e testa fluxo completo, Excel, PDF textual e OCR. Nunca aponte esse teste para dados reais.

WebMCP é opcional e detectado pelo navegador: as ferramentas expostas apenas consultam o estado da importação e abrem sua tela. Não enviam arquivos nem concluem o processamento. A validação em um navegador com suporte nativo ao WebMCP não estava disponível nesta entrega.
