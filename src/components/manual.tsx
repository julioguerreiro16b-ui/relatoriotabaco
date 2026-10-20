'use client';
import { useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Expand, ShieldCheck } from 'lucide-react';
import { Modal } from './shared';
import './manual.css';

type Destination = 'import' | 'review' | 'summary' | 'history' | 'products' | 'settings';
const guides: { id: string; title: string; screen: Destination; image?: string; caption?: string; steps: string[]; tip: string }[] = [
  { id: 'preparar', title: '1. Organize os documentos', screen: 'import', steps: [
    'Separe os arquivos por período e origem: histórico, saídas, entradas, Entry Summary, sites, perdas e cadastro de produtos.',
    'Use XLSX, CSV ou PDF, com até 3 MB por arquivo. PDFs podem ter até 40 páginas. Prefira arquivos legíveis e planilhas com cabeçalhos claros.',
    'Em Importar arquivos, baixe o Modelo de movimentações ou o Modelo de produtos quando precisar montar uma planilha.',
  ], tip: 'Mantenha os originais em uma pasta por mês. Use nomes como 2026-10_entradas_invoice-001.pdf para localizar a origem depois.' },
  { id: 'importar', title: '2. Importe e confira o checklist', screen: 'import', image: 'importar', caption: 'Selecione a origem à esquerda e acompanhe as fontes no checklist à direita.', steps: [
    'Selecione a origem antes de clicar em Selecionar arquivos ou arrastar os documentos para a área de envio.',
    'Aguarde a análise. Arquivos idênticos já recebidos são identificados; confira a mensagem antes de tentar reenviar.',
    'No checklist, envie cada fonte obrigatória ou marque Arquivo não disponível quando ela realmente estiver ausente. Isso indica que o relatório pode estar incompleto.',
    'Informe o estoque inicial por produto somente quando ele não estiver no histórico. Use o saldo no início da data de referência e registre a origem da contagem.',
    'Clique em Conferir checklist e continuar, confira a lista e confirme Processar dados recebidos.',
  ], tip: 'Importar não significa confirmar: registros duvidosos seguem para Revisar dados antes de entrar nos cálculos.' },
  { id: 'revisar', title: '3. Revise e concilie', screen: 'review', image: 'revisar', caption: 'A revisão reúne os registros e suas pendências para conferência.', steps: [
    'Abra Revisar dados e confira os motivos de cada pendência. Compare data, produto, quantidade, gramatura, peso e destino com o documento.',
    'Consulte a origem do registro para localizar arquivo, aba, linha ou página e baixar o original quando disponível.',
    'Em possíveis duplicidades, determine se os documentos representam a mesma movimentação ou operações distintas. Na conciliação, escolha conscientemente o peso e a data.',
    'Registre uma justificativa clara para correções e decisões. Confira novamente os registros após a conciliação.',
    'Use Validar e verificar tudo para consultar problemas nos novos dados e a integridade dos arquivos. Depois de alterações, execute a verificação novamente.',
  ], tip: 'O histórico original é preservado e aceito como fornecido; a validação não o recalcula nem substitui a revisão humana dos novos documentos.' },
  { id: 'relatorios', title: '4. Consulte e exporte', screen: 'summary', image: 'relatorios', caption: 'Confira o ano, o produto e as opções de exportação antes de usar o relatório.', steps: [
    'Escolha o ano no topo da tela. Use Saídas, Entradas, Balanço, Vendas Flórida ou Resumo mensal conforme a análise.',
    'Mantenha Dry Snuff e Mapacho separados. KG é a referência; nos novos dados, o peso é quantidade × gramas ÷ 1.000.',
    'Observe avisos de dados incompletos, saldos negativos ou desconhecidos. Saldo desconhecido não significa estoque zero.',
    'Confira os filtros da tela. Filtros de cliente, estado, canal e origem se aplicam às tabelas de movimentações e Flórida; não redefinem o estoque completo do balanço.',
    'Use CSV, Excel ou Relatório completo nas telas com exportação. Confira período, unidade e pendências antes de compartilhar.',
  ], tip: 'Para conferência histórica, consulte Histórico original na referência abaixo: os valores da planilha são preservados, inclusive KG e LB informados.' },
  { id: 'rotina', title: '5. Faça o fechamento do período', screen: 'settings', steps: [
    'Confirme se todas as fontes esperadas foram recebidas e anote as que continuam indisponíveis.',
    'Resolva pendências dos novos documentos, execute a validação e revise os saldos por produto.',
    'Exporte o relatório completo e guarde uma cópia junto dos documentos que sustentam o período.',
    'Em Configurações, consulte o histórico de alterações. A restauração está disponível apenas nas alterações que exibem essa opção e exige justificativa.',
  ], tip: 'Uma exportação Excel é um relatório, não um backup completo do sistema. Preserve também os documentos originais e mantenha uma rotina de backup do banco.' },
];

export default function Manual({ onNavigate }: { onNavigate: (view: Destination) => void }) {
  const [zoom, setZoom] = useState<(typeof guides)[number] | null>(null);
  return <div className="manual">
    <section className="manual-hero">
      <BookOpen size={34} aria-hidden="true" />
      <div><span className="eyebrow">GUIA PRÁTICO · H&F</span><h2>Do primeiro arquivo ao fechamento do mês</h2><p>Um passo a passo para manter documentos, estoque e relatórios organizados. As imagens mostram telas do sistema com dados demonstrativos.</p></div>
    </section>
    <nav className="manual-index" aria-label="Seções do manual" onClick={event => {
      const target = (event.target as HTMLElement).closest('a');
      if (target) { event.preventDefault(); document.querySelector(target.hash)?.scrollIntoView({ behavior: 'smooth' }); }
    }}>{guides.map(g => <a key={g.id} href={`#manual-${g.id}`}>{g.title}</a>)}<a href="#manual-praticas">Boas práticas e referências</a></nav>
    {guides.map(g => <section className="panel manual-section" id={`manual-${g.id}`} key={g.id}>
      <div className="manual-section-heading"><h2>{g.title}</h2><button className="text-link" onClick={() => onNavigate(g.screen)}>Abrir tela <ArrowRight size={16} /></button></div>
      <ol>{g.steps.map(step => <li key={step}>{step}</li>)}</ol>
      {g.image && <figure><button className="manual-image" onClick={() => setZoom(g)} aria-label={`Ampliar imagem: ${g.title}`}>
        {/* Screenshots are static local documentation assets. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/manual/${g.image}.png`} alt={g.caption} width={1280} height={900} loading="lazy" />
        <span><Expand size={16} /> Ampliar imagem</span>
      </button><figcaption>{g.caption} Exemplo demonstrativo, sem dados reais de clientes.</figcaption></figure>}
      <div className="manual-tip"><CheckCircle2 size={20} aria-hidden="true" /><p>{g.tip}</p></div>
    </section>)}
    <section className="panel manual-section" id="manual-praticas">
      <h2><ShieldCheck size={22} aria-hidden="true" /> Boas práticas</h2>
      <div className="manual-practices">
        <div><h3>Antes de salvar</h3><p>Confira unidade, data, SKU e produto. Não estime pesos ausentes. Cadastre a gramatura correta em Produtos para ajudar as próximas importações.</p></div>
        <div><h3>Ao corrigir</h3><p>Explique o motivo e cite o documento que sustenta a mudança. Se os dados mudarem em outra sessão, atualize a página e confira a versão atual antes de salvar.</p></div>
        <div><h3>Ao compartilhar</h3><p>Revise o conteúdo exportado e envie apenas a quem precisa acessá-lo. Não compartilhe a senha do espaço, tokens do banco ou arquivos de configuração em capturas de tela.</p></div>
        <div><h3>Ao interpretar</h3><p>OCR e layouts desconhecidos podem exigir correção manual. Avisos de incompletude precisam acompanhar a análise; uma validação sem erros não comprova que todos os documentos foram enviados.</p></div>
      </div>
      <h3>Referências dentro do sistema</h3>
      <p>Use estas telas para conferir a informação na origem:</p>
      <div className="manual-references">
        <button className="secondary" onClick={() => onNavigate('history')}>Histórico original</button>
        <button className="secondary" onClick={() => onNavigate('products')}>Produtos e gramaturas</button>
        <button className="secondary" onClick={() => onNavigate('import')}>Modelos e arquivos originais</button>
        <button className="secondary" onClick={() => onNavigate('settings')}>Histórico de alterações</button>
      </div>
      <details><summary>Por que um número não aparece no relatório?</summary><p>Confira o ano e os filtros, o produto escolhido, a conclusão do checklist e o status do registro. Movimentações pendentes, ignoradas ou conciliadas como duplicatas não entram como movimentações confirmadas independentes.</p></details>
      <details><summary>Posso reenviar um arquivo corrigido?</summary><p>Um arquivo com conteúdo alterado pode ser recebido como um novo documento. Confira os registros anteriores e as possíveis duplicidades; reenviar não substitui automaticamente a importação anterior.</p></details>
      <details><summary>Onde vejo o documento que originou um valor?</summary><p>Nas tabelas de movimentações, use Ver origem. O detalhe mostra as referências disponíveis e permite baixar o documento original. Valores informados manualmente exibem a justificativa registrada.</p></details>
    </section>
    {zoom && <Modal title={zoom.title} onClose={() => setZoom(null)} wide>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="manual-zoom" src={`/manual/${zoom.image}.png`} alt={zoom.caption} />
      <p>{zoom.caption}</p>
    </Modal>}
  </div>;
}
