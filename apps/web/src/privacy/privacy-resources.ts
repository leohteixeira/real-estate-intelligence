export const privacyPortuguese = {
  title: 'Privacidade',
  introduction:
    'Entenda quais dados o Real Estate Intelligence usa, de onde vêm e quais limites ainda precisam ser resolvidos antes de tratar dados reais.',
  scope:
    'Esta versão usa dados sintéticos identificados como demonstração. Nenhuma fonte real de anúncios está habilitada. Este aviso descreve o funcionamento atual e as condições do projeto para um futuro uso real; sua publicação não autoriza a coleta.',
  contents: 'Neste aviso',
  fieldsTitle: 'Dados coletados e limites',
  fields:
    'Para anúncios reais, o limite permitido é: tipo de imóvel, preço pedido, área, quartos, banheiros, vagas e características; localização publicada pela fonte, sem unidade ou complemento; datas, fonte e URL do anúncio; tipo de anunciante e nome de imobiliária como pessoa jurídica; descrição com telefones, e-mails, CPF e links mascarados; e impressões digitais de imagens quando permitidas. Campos desconhecidos são descartados ou rejeitados. O formato atualmente armazenado pode ser mais restrito.',
  excluded:
    'Nomes, telefones, e-mails e CRECI individual de pessoas naturais, além de fotografias, não podem ser armazenados. Fotografias só poderão ser obtidas com permissão específica: uma impressão digital determinística por fotografia, calculada em memória, seguida de descarte imediato. Receber e examinar conteúdo em memória também é tratamento. Mascaramento, hashes e impressões digitais não garantem anonimato: localização, histórico e links ainda podem identificar ou relacionar pessoas. Dados sensíveis e de crianças não são uma finalidade deste produto.',
  sourcesTitle: 'Fontes, licenças e atribuição',
  sourcesIntro:
    'A lista abaixo vem da API de fontes habilitadas. Os nomes publicados são a atribuição de cada fonte. As permissões de coleta, imagens e exibição de texto são independentes; uma não concede as outras. Uma licença não substitui a avaliação de privacidade. Não há atribuição a fontes que não estejam em uso.',
  sourceLoading: 'Carregando fontes habilitadas…',
  sourceError: 'Não foi possível consultar as fontes habilitadas.',
  sourceErrorContext:
    'O restante deste aviso continua disponível. Tente novamente para consultar as evidências atuais.',
  sourceStale:
    'A consulta falhou. A lista da última leitura válida foi mantida e pode estar desatualizada.',
  sourceRefreshing: 'Atualizando as fontes habilitadas…',
  sourceEmpty: 'Nenhuma fonte está habilitada nesta consulta.',
  sourceEnabled: 'Fonte habilitada',
  licenceLicensed: 'Licença:',
  licenceUnverified: 'Licença não verificada. Não há licença publicada nesta consulta.',
  licenceNotApplicable: 'Licença não aplicável:',
  collectionPermission: 'Coleta',
  imagePermission: 'Obtenção de imagens',
  textPermission: 'Exibição de texto',
  allowed: 'permitida',
  denied: 'não permitida',
  purposeTitle: 'Finalidade',
  purpose:
    'O produto organiza fatos de imóveis para explicar preços pedidos por metro quadrado, mudanças, tempo de anúncio e possíveis correspondências entre anúncios, com fontes e datas. Imóvel e anúncio são entidades distintas. Os cálculos de mercado são determinísticos no backend. Preço pedido não é preço de venda, e a retirada de um anúncio não comprova uma venda. Os dados sintéticos não descrevem o mercado real.',
  purposeLimits:
    'O objetivo não é contatar vendedores, identificar ocupantes, inferir patrimônio ou características sensíveis, treinar modelos com conteúdo coletado ou vender perfis pessoais. Um novo uso exige nova avaliação.',
  basisTitle: 'Base legal e condições para dados reais',
  basis:
    'O legítimo interesse é a base proposta e condicionada para as operações que possam envolver dados identificáveis. A avaliação de finalidade, necessidade e equilíbrio deve ser refeita para cada fonte e operação real. O fato de um anúncio ser público não concede reutilização irrestrita; permissão da fonte e base legal são requisitos distintos. Os registros de tratamento e a avaliação de legítimo interesse aceitos são uma referência de engenharia, não aprovação jurídica, certificação ou autorização da ANPD.',
  gates:
    'O tratamento real permanece desabilitado enquanto faltarem identidade e contato públicos do controlador, permissão da fonte, revisão de minimização, prazos de retenção, fluxo de direitos e remoção, segurança operacional e evidências sobre fornecedores, contratos, regiões e transferências. Configurar um nome e um e-mail não resolve os demais requisitos.',
  retentionTitle: 'Retenção e descarte',
  snapshots:
    'Snapshots sanitizados de fontes reais devem ser criptografados e expirar 30 dias (720 horas) após a coleta confiável original. Repetição e reprocessamento não renovam esse prazo. A leitura e a gravação fecham no vencimento; a exclusão física pode atrasar durante indisponibilidade e requer reconciliação. Dados sintéticos podem permanecer além desse período. O hash de proveniência pode sobreviver ao snapshot.',
  history:
    'O prazo do snapshot não é um prazo de exclusão de todo o sistema. Histórico normalizado, hashes, impressões digitais, auditoria, correspondência de direitos, logs, traces, filas de erro e backups ainda precisam de prazos concretos e revisão de necessidade antes do uso real correspondente. Eventos já publicados no outbox têm janela de sete dias; marcadores consumidos no inbox, de trinta dias. São limites de entrega, não autorização para reter os demais registros indefinidamente.',
  checkpoints:
    'No fluxo de perguntas, os dados de checkpoint do grafo têm horizonte fixo de trinta dias desde o primeiro checkpoint persistido da execução. A política preserva a linhagem completa de até oito turnos terminais mais recentes por conversa, além do trabalho ativo não expirado. A limpeza desses dados não apaga a execução terminal, o recibo, eventos SSE, impressão da requisição ou identidade de entrega; seus prazos não são definidos por esse limite.',
  sharingTitle: 'Processamento, fornecedores e armazenamento local',
  sharing:
    'As evidências atuais são de ambientes locais controlados com dados sintéticos. Fornecedores de hospedagem, telemetria, países, suboperadores, contratos e mecanismos de transferência para dados reais ainda precisam ser verificados. Leitores públicos podem copiar os fatos exibidos e seguir os links das fontes; não é possível garantir a retirada de cópias independentes. Logs e traces devem excluir conteúdo de anúncios, SQL, prompts, respostas, credenciais e strings de conexão.',
  models:
    'A ingestão do MVP não usa modelos. Rotas externas que recebam texto do usuário exigem evidência verificável de Zero Data Retention antes do envio e controle por requisição; sem isso, o envio é recusado, inclusive nos fallbacks. Essa exigência não afirma que todo armazenamento do produto tem retenção zero, nem substitui a avaliação de destinatários e base legal. A preferência de idioma pode ser guardada no localStorage do navegador; as leituras da aplicação também usam cache em memória. Este aviso não afirma ausência de armazenamento local.',
  rightsTitle: 'Seus direitos',
  rights:
    'Você pode solicitar confirmação e acesso, correção de dados inexatos, informações sobre compartilhamento e apresentar oposição. Também pode solicitar anonimização, bloqueio ou eliminação quando aplicável, com verificação proporcional da solicitação e dos limites legais pertinentes. A confirmação da identidade não autoriza coletar documentos ou contatos além do necessário. O controlador precisa manter um processo de resposta, revisão e escalonamento antes de atender casos reais.',
  removalTitle: 'Solicitação de remoção',
  removal:
    'A política prevista registra primeiro a supressão da identidade estável do anúncio na fonte, depois remove os dados armazenados, snapshots e impressões digitais, preservando apenas a supressão e a evidência mínima justificada. A exclusão deve alcançar consumidores, caches e cópias de entrega. Coleta, reprocessamento, novas entregas e restauração de backups não podem recriar o conteúdo suprimido.',
  removalLimit:
    'O fluxo de remoção e sua propagação ainda não estão implementados e verificados como um serviço público. Este documento não envia uma solicitação, não oferece um comando de exclusão e não promete prazo de atendimento ou apagamento de todos os backups. Antes do uso real, o controlador deve comprovar esse fluxo e publicar os prazos aplicáveis. Se houver contato configurado abaixo, ele é apenas um canal de correspondência.',
  controllerTitle: 'Controlador e contato',
  controllerRole:
    'O proprietário do produto, uma pessoa natural, é responsável pelas finalidades, fontes, retenção, fornecedores e atendimento de direitos. Uma delegação de engenharia não transfere essa responsabilidade.',
  controllerName: 'Nome público do controlador:',
  controllerMissing:
    'A identidade pública do controlador não foi configurada ou é inválida. Sua publicação e verificação são um requisito para tratar dados reais.',
  contactLabel: 'Contato para privacidade:',
  contactMissing:
    'Não há e-mail público de privacidade configurado e válido. Nenhum canal de atendimento funcional é anunciado nesta versão; o controlador deve fornecê-lo e verificá-lo antes de tratar dados reais.',
  closing:
    'Este aviso acompanha o escopo sintético atual. Fontes, finalidade, retenção, fornecedores e controles devem ser reavaliados antes de qualquer mudança para tratamento real.',
} as const;

export const privacyEnglish: { readonly [K in keyof typeof privacyPortuguese]: string } = {
  title: 'Privacy',
  introduction:
    'Understand what data Real Estate Intelligence uses, where it comes from, and which limits still need to be resolved before processing real data.',
  scope:
    'This version uses synthetic data labelled as demonstration. No real listing source is enabled. This notice describes current behavior and the project’s conditions for future real use; publishing it does not authorize collection.',
  contents: 'In this notice',
  fieldsTitle: 'Collected data and limits',
  fields:
    'For real listings, the permitted ceiling is: property type, asking price, area, bedrooms, bathrooms, parking spaces and features; source-published location without unit or complement; dates, source and listing URL; advertiser type and agency name as a legal entity; description with phone numbers, email addresses, CPF numbers and links masked; and image fingerprints when permitted. Unknown fields are dropped or rejected. The currently stored format may be narrower.',
  excluded:
    'Names, phone numbers, email addresses and individual CRECI numbers of natural persons, and photographs, must not be stored. Photographs may only be fetched with specific permission: one deterministic fingerprint per photograph, computed in memory, followed by immediate disposal. Receiving and inspecting content in memory is also processing. Masking, hashes and fingerprints do not guarantee anonymity: location, history and links may still identify or connect people. Sensitive data and children’s data are not a purpose of this product.',
  sourcesTitle: 'Sources, licences and attribution',
  sourcesIntro:
    'The list below comes from the enabled-sources API. Published names provide attribution for each source. Collection, image and text-display permissions are independent; one does not grant the others. A licence does not replace a privacy assessment. No attribution is assigned to sources that are not in use.',
  sourceLoading: 'Loading enabled sources…',
  sourceError: 'Enabled sources could not be read.',
  sourceErrorContext:
    'The rest of this notice remains available. Try again to inspect current evidence.',
  sourceStale:
    'The read failed. The last valid source list has been retained and may be out of date.',
  sourceRefreshing: 'Refreshing enabled sources…',
  sourceEmpty: 'No source is enabled in this response.',
  sourceEnabled: 'Enabled source',
  licenceLicensed: 'Licence:',
  licenceUnverified: 'Licence not verified. No licence is published in this response.',
  licenceNotApplicable: 'Licence not applicable:',
  collectionPermission: 'Collection',
  imagePermission: 'Image fetching',
  textPermission: 'Text display',
  allowed: 'allowed',
  denied: 'not allowed',
  purposeTitle: 'Purpose',
  purpose:
    'The product organizes property facts to explain asking prices per square meter, changes, listed time and possible matches between listings, with sources and dates. Property and listing are separate entities. Market calculations are deterministic in the backend. An asking price is not a sale price, and a listing’s disappearance does not prove a sale. Synthetic data does not describe the real market.',
  purposeLimits:
    'The purpose is not to contact sellers, identify occupants, infer wealth or sensitive characteristics, train models on collected content or sell personal profiles. A new use requires a new assessment.',
  basisTitle: 'Legal basis and conditions for real data',
  basis:
    'Legitimate interest is the proposed conditional basis for operations that may involve identifiable data. Purpose, necessity and balancing must be reassessed for each real source and operation. A public listing does not grant unrestricted reuse; source permission and legal basis are separate requirements. The accepted processing record and legitimate-interest assessment are an engineering baseline, not legal approval, certification or ANPD authorization.',
  gates:
    'Real processing remains disabled while public controller identity and contact, source permission, minimization review, retention periods, rights and removal workflows, operational security, and evidence about suppliers, contracts, regions and transfers remain unresolved. Configuring a name and email does not satisfy the other requirements.',
  retentionTitle: 'Retention and disposal',
  snapshots:
    'Sanitized real-source snapshots must be encrypted and expire 30 days (720 hours) after the original trusted collection time. Retries and reprocessing do not renew this deadline. Reads and writes close at expiry; physical deletion can lag during an outage and needs reconciliation. Synthetic data may remain beyond that period. The provenance hash can survive the snapshot.',
  history:
    'The snapshot deadline is not a whole-system erasure deadline. Normalized history, hashes, fingerprints, audit, rights correspondence, logs, traces, dead letters and backups still need concrete periods and necessity review before the corresponding real use. Published outbox events have a seven-day window; consumed inbox markers, thirty days. These are delivery limits, not permission to retain the other records indefinitely.',
  checkpoints:
    'In the question flow, graph checkpoint payloads have a fixed thirty-day horizon from the run’s first persisted checkpoint. The policy preserves the full lineage of up to the latest eight terminal turns per thread, plus unexpired active work. Cleaning those payloads does not erase the terminal run, receipt, SSE events, request fingerprint or delivery identity; that limit does not define their retention periods.',
  sharingTitle: 'Processing, suppliers and local storage',
  sharing:
    'Current evidence concerns controlled local environments with synthetic data. Hosting and telemetry suppliers, countries, subprocessors, contracts and transfer mechanisms for real data still need verification. Public readers can copy displayed facts and follow source links; recall of independent copies cannot be guaranteed. Logs and traces must exclude listing content, SQL, prompts, responses, credentials and connection strings.',
  models:
    'MVP ingestion uses no model. External routes receiving user text require verifiable Zero Data Retention evidence before transmission and a per-request control; without it, transmission is refused, including fallbacks. This requirement does not claim that all product storage has zero retention or replace recipient and legal-basis assessment. The language preference may be saved in browser localStorage; application reads also use an in-memory cache. This notice does not claim an absence of local storage.',
  rightsTitle: 'Your rights',
  rights:
    'You may request confirmation and access, correction of inaccurate data, information about sharing, and raise an objection. You may also request anonymization, blocking or erasure where applicable, with proportionate verification of the request and relevant legal limits. Identity verification does not justify collecting more documents or contacts than necessary. The controller needs a response, review and escalation process before handling real cases.',
  removalTitle: 'Removal requests',
  removal:
    'The planned policy first records suppression of the listing’s stable source identity, then removes stored data, snapshots and fingerprints while retaining only suppression and minimum justified evidence. Erasure must reach consumers, caches and delivery copies. Collection, reprocessing, redelivery and restored backups must not recreate suppressed content.',
  removalLimit:
    'The removal workflow and its propagation have not yet been implemented and verified as a public service. This document does not submit a request, provide an erasure command, or promise response deadlines or erasure of all backups. Before real use, the controller must prove this workflow and publish applicable periods. If a contact is configured below, it is only a correspondence channel.',
  controllerTitle: 'Controller and contact',
  controllerRole:
    'The product owner, a natural person, is responsible for purposes, sources, retention, suppliers and rights handling. Delegating engineering does not transfer this responsibility.',
  controllerName: 'Public controller name:',
  controllerMissing:
    'The controller’s public identity is not configured or is invalid. Publishing and verifying it is a requirement for processing real data.',
  contactLabel: 'Privacy contact:',
  contactMissing:
    'No valid public privacy email is configured. No functional rights channel is advertised in this version; the controller must provide and verify one before processing real data.',
  closing:
    'This notice accompanies the current synthetic scope. Sources, purpose, retention, suppliers and controls must be reassessed before any change to real processing.',
};
