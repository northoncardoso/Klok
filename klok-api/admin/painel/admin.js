// Painel de suporte da KLOK. A sessão é por cookie HttpOnly (klok_admin) mais o
// cookie legível klok_csrf, então nenhum token fica guardado no navegador nem
// aparece no HTML. O valor do klok_csrf vai em x-csrf-token em toda chamada,
// inclusive GET, porque o CSRF vale para qualquer requisição autenticada por
// cookie.

const estado = {
    empresas: [],
    selecionada: null,
    csrf: '',
    pontosPagina: 1,
    pontosPaginas: 0,
};

const FORMATO_DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
});

const FORMATO_NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

// Espelha o mínimo que o backend exige para a senha do coordenador. A checagem
// local só evita uma ida ao servidor para nada.
const MINIMO_SENHA = 4;

/** Atalho para pegar um elemento do documento pelo id. */
function porId(id) {
    return document.getElementById(id);
}

/** Exibir ou ocultar um elemento pelo atributo hidden. */
function mostrar(elemento, visivel) {
    elemento.hidden = !visivel;
}

/**
 * Escrever o aviso de uma área da tela e marcar o tipo dele no dataset, que o CSS usa para colorir.
 * @param {string} id elemento que recebe o texto
 * @param {string} texto mensagem exibida
 * @param {string} tipo erro, ok ou vazio
 */
function mensagem(id, texto, tipo = 'erro') {
    const alvo = porId(id);
    alvo.textContent = texto;
    alvo.dataset.tipo = tipo;
}

/**
 * Ler o valor do cookie legível de CSRF e devolver string vazia quando ele falta.
 * @returns {string} o valor que vai no cabeçalho de CSRF de toda chamada
 */
function csrfDoCookie() {
    const par = document.cookie
        .split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith('klok_csrf='));
    return par ? par.slice('klok_csrf='.length) : '';
}

/**
 * Formatar data e hora no padrão curto brasileiro, devolvendo 'nenhum' quando o valor falta.
 * @param {string|number|null} valor data vinda da API
 * @returns {string} texto pronto para a tabela, ou o valor cru quando a data é inválida
 */
function formatarDataHora(valor) {
    if (!valor) return 'nenhum';
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return String(valor);
    return FORMATO_DATA_HORA.format(data);
}

/**
 * Converter bytes em B, KB ou MB para o tamanho do banco no cartão de resumo.
 * @param {number} bytes
 * @returns {string} texto vazio quando o valor não é um número
 */
function formatarTamanho(bytes) {
    if (!Number.isFinite(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${FORMATO_NUMERO.format(kb)} KB`;
    return `${FORMATO_NUMERO.format(kb / 1024)} MB`;
}

// Download de CSV e de backup não pode ser link direto: o CSRF vale também no
// GET, então o arquivo precisa sair por fetch com credentials, o header
// x-csrf-token e a resposta virada em blob com link temporário.
/**
 * Chamar a API do painel e devolver o JSON da resposta.
 *
 * Toda chamada leva o CSRF no cabeçalho, inclusive GET, porque a sessão vive em
 * cookie httpOnly e a proteção vale para qualquer requisição autenticada. Um 401
 * derruba o estado local e devolve o login, menos na própria rota de login.
 * @param {string} caminho rota da API
 * @param {object} [opcoes] método, corpo serializado em JSON e cabeçalhos extras
 * @returns {Promise<object|null>} dados da resposta, ou nulo quando não há JSON
 */
async function api(caminho, { method = 'GET', corpo, headers = {} } = {}) {
    const resp = await fetch(caminho, {
        method,
        credentials: 'same-origin',
        headers: {
            ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
            ...headers,
            ...(estado.csrf ? { 'x-csrf-token': estado.csrf } : {}),
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });

    let dados = null;
    try {
        dados = await resp.json();
    } catch {
        dados = null;
    }

    if (resp.status === 401 && caminho !== '/api/admin/login') {
        const expirada = 'Sessão expirada, entre de novo.';
        // O cookie de CSRF sobrevive ao recarregar a página. Se ele existe mas a
        // sessão já morreu, o estado local cai e o login volta.
        if (estado.csrf) sair(expirada);
        throw new Error(expirada);
    }
    if (!resp.ok) {
        throw new Error(dados?.erro || 'Falha na requisição');
    }
    return dados;
}

/**
 * Montar uma célula de tabela com textContent, sem innerHTML, então nada do dado vira HTML.
 * @param {string|number|null} valor
 * @returns {HTMLTableCellElement}
 */
function celulaTexto(valor) {
    const celula = document.createElement('td');
    celula.textContent = valor === null || valor === undefined ? '' : String(valor);
    return celula;
}

/** Criar a célula reservada aos botões de ação de uma linha. */
function celulaAcoes() {
    // Célula das ações de cada linha, preenchida por quem monta a linha.
    return document.createElement('td');
}

/**
 * Criar um botão de ação já com type button, para não enviar formulário sem querer.
 * @param {string} texto rótulo visível
 * @param {string} [classe] estilo do botão, secundario por padrão
 * @returns {HTMLButtonElement}
 */
function botaoAcao(texto, classe = 'secundario') {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.textContent = texto;
    botao.className = classe;
    return botao;
}

// Toda ação desabilita o próprio botão enquanto a requisição corre e reabilita
// no finally, então uma falha não deixa o botão travado.
/**
 * Rodar uma ação com o botão desabilitado e reabilitar no finally, então uma falha não deixa o botão travado.
 * @param {HTMLButtonElement|null} botao
 * @param {Function} acao
 * @returns {Promise<*>} o resultado da ação
 */
async function comBotao(botao, acao) {
    if (botao) botao.disabled = true;
    try {
        return await acao();
    } finally {
        if (botao) botao.disabled = false;
    }
}

/**
 * Descobrir o nome do arquivo pelo cabeçalho de disposição da resposta, com decodificação de URI.
 * @param {Response} resp
 * @param {string} padrao nome usado quando o cabeçalho não traz nada
 * @returns {string}
 */
function nomeDoArquivo(resp, padrao) {
    const disposicao = resp.headers.get('content-disposition') ?? '';
    const encontrado = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposicao);
    if (!encontrado) return padrao;
    const bruto = encontrado[1].trim();
    try {
        return decodeURIComponent(bruto);
    } catch {
        return bruto;
    }
}

/**
 * Ler o campo erro de uma resposta JSON e cair no texto padrão quando não há JSON.
 * @param {Response} resp
 * @param {string} padrao
 * @returns {Promise<string>}
 */
async function lerErro(resp, padrao) {
    try {
        const dados = await resp.json();
        if (dados && dados.erro) return dados.erro;
    } catch {
        // Resposta sem JSON: fica a mensagem padrão.
    }
    return padrao;
}

// O download precisa passar pelo fetch por causa do CSRF no GET, então a
// resposta vira blob e o nome sai do content-disposition quando ele existe.
/**
 * Baixar um arquivo por fetch e entregar ao navegador como blob com link temporário.
 *
 * O download não pode ser link direto porque o CSRF vale também no GET, então o
 * cabeçalho de CSRF acompanha a requisição.
 * @param {string} caminho rota do arquivo
 * @param {string} padrao nome de reserva quando a resposta não informa
 * @returns {Promise<void>}
 */
async function baixarArquivo(caminho, padrao) {
    const resp = await fetch(caminho, {
        method: 'GET',
        credentials: 'same-origin',
        headers: estado.csrf ? { 'x-csrf-token': estado.csrf } : {},
    });

    if (resp.status === 401 && estado.csrf) {
        const expirada = 'Sessão expirada, entre de novo.';
        sair(expirada);
        throw new Error(expirada);
    }
    if (!resp.ok) throw new Error(await lerErro(resp, 'Falha ao baixar o arquivo'));

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeDoArquivo(resp, padrao);
    document.body.append(link);
    link.click();
    link.remove();
    // O endereço só pode ser liberado depois que o navegador leu o clique.
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

// A restauração manda bytes crus, então não passa por api(), que serializa o
// corpo em JSON. O tratamento de sessão expirada é o mesmo.
/**
 * Mandar os bytes crus do backup para a restauração, fora do api(), que só serializa JSON.
 *
 * O código da empresa vai no cabeçalho de confirmação e o CSRF no cabeçalho de
 * sempre. Sessão expirada segue o mesmo tratamento do api().
 * @param {string} caminho
 * @param {File|Blob} arquivo
 * @param {string} codigo código da empresa usado na confirmação
 * @returns {Promise<object|null>} resposta da restauração, ou nulo quando ela não traz JSON
 */
async function enviarArquivo(caminho, arquivo, codigo) {
    const resp = await fetch(caminho, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'content-type': 'application/octet-stream',
            'x-confirmar-codigo': codigo,
            ...(estado.csrf ? { 'x-csrf-token': estado.csrf } : {}),
        },
        body: arquivo,
    });

    if (resp.status === 401 && estado.csrf) {
        const expirada = 'Sessão expirada, entre de novo.';
        sair(expirada);
        throw new Error(expirada);
    }
    if (!resp.ok) throw new Error(await lerErro(resp, 'Falha ao restaurar o backup'));

    try {
        return await resp.json();
    } catch {
        return null;
    }
}

/**
 * Inserir uma linha que ocupa todas as colunas com o aviso de lista vazia.
 * @param {HTMLElement} corpo corpo da tabela
 * @param {number} colunas quantas colunas a tabela tem
 * @param {string} texto aviso exibido
 */
function linhaVazia(corpo, colunas, texto) {
    const linha = document.createElement('tr');
    const celula = document.createElement('td');
    celula.colSpan = colunas;
    celula.textContent = texto;
    linha.append(celula);
    corpo.append(linha);
}

/**
 * Zerar tabelas, resumos, filtros e paginação ao trocar de empresa, para não misturar dados de duas.
 *
 * O filtro de funcionário volta para vazio e o arquivo escolhido para restauração
 * é descartado, porque os dois eram da empresa anterior.
 */
function limparDadosDaEmpresa() {
    for (const id of ['tabela-coordenadores', 'tabela-funcionarios', 'tabela-pontos', 'tabela-solicitacoes']) {
        porId(id).textContent = '';
    }
    // Zerar o filtro de funcionário evita mandar id de uma empresa para a outra.
    desenharSeletorFuncionarios([]);
    porId('resumo-funcionarios').textContent = '0';
    porId('resumo-coordenadores').textContent = '0';
    porId('resumo-pontos').textContent = '0';
    porId('resumo-pendentes').textContent = '0';
    porId('resumo-ultimo-ponto').textContent = 'nenhum';
    porId('banco-versao').textContent = '';
    porId('banco-tamanho').textContent = '';
    // O arquivo escolhido pertence à empresa anterior, então sai junto com ela.
    porId('arquivo-restaurar').value = '';
    porId('ponto-paginacao').textContent = '';
    estado.pontosPagina = 1;
    estado.pontosPaginas = 0;
    porId('ponto-anterior').disabled = true;
    porId('ponto-proximo').disabled = true;
}

/**
 * Encerrar a sessão local, voltar para a tela de login e avisar a API do logout.
 *
 * Limpa o estado, esconde o painel e chama a rota de logout direto no fetch, sem
 * passar por api(), para não cair em laço de 401. A falha do logout é ignorada de
 * propósito, porque o estado local já está limpo.
 * @param {string} texto aviso mostrado no login, vazio para não avisar nada
 */
function sair(texto) {
    const csrf = estado.csrf;
    estado.csrf = '';
    estado.empresas = [];
    estado.selecionada = null;
    estado.pontosPagina = 1;
    estado.pontosPaginas = 0;

    mostrar(porId('bloco-painel'), false);
    mostrar(porId('botao-sair'), false);
    mostrar(porId('bloco-login'), true);
    mostrar(porId('bloco-empresa'), false);
    porId('seletor-empresa').textContent = '';
    porId('lista-empresas').textContent = '';
    limparDadosDaEmpresa();
    mensagem('mensagem-login', texto || '', texto ? 'erro' : '');

    // Logout direto no fetch, sem passar por api(): com sessão já expirada ele
    // responde 401 e api() chamaria sair() de novo em laço. A falha é ignorada
    // de propósito, o estado local já foi limpo. Sem cookie de CSRF não existe
    // sessão para encerrar, então nem chama a rota.
    if (!csrf) return;
    fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': csrf },
    }).catch(() => {});
}

/** Abrir o painel depois do login, limpar o campo de senha e carregar a lista de empresas. */
function entrarNoPainel() {
    mostrar(porId('bloco-login'), false);
    mostrar(porId('bloco-painel'), true);
    mostrar(porId('botao-sair'), true);
    porId('login-senha').value = '';
    mensagem('mensagem-login', '');
    carregarEmpresas();
}

/** Preencher o seletor de empresas com as opções do estado, marcando a que está aberta. */
function desenharSeletorEmpresas() {
    const seletor = porId('seletor-empresa');
    seletor.textContent = '';

    const vazia = document.createElement('option');
    vazia.value = '';
    vazia.textContent = estado.empresas.length === 0 ? 'Nenhuma empresa' : 'Escolha uma empresa';
    seletor.append(vazia);

    for (const empresa of estado.empresas) {
        const opcao = document.createElement('option');
        opcao.value = empresa.codigo;
        opcao.textContent = `${empresa.codigo}: ${empresa.nome}`;
        seletor.append(opcao);
    }

    seletor.value = estado.selecionada ? estado.selecionada.codigo : '';
}

/**
 * Montar a tabela de empresas da tela inicial, célula por célula, com textContent em vez de innerHTML.
 */
function desenharEmpresas() {
    const corpo = porId('lista-empresas');
    corpo.textContent = '';

    if (estado.empresas.length === 0) {
        linhaVazia(corpo, 4, 'Nenhuma empresa ainda.');
        desenharSeletorEmpresas();
        return;
    }

    for (const empresa of estado.empresas) {
        const linha = document.createElement('tr');

        const codigo = document.createElement('td');
        codigo.textContent = empresa.codigo;

        const nome = document.createElement('td');
        nome.textContent = empresa.nome;

        const status = document.createElement('td');
        status.textContent = empresa.desativadaEm ? 'Desativada' : 'Ativa';

        const acoes = document.createElement('td');
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'secundario';
        botao.textContent = 'Abrir';
        botao.dataset.codigo = empresa.codigo;
        acoes.append(botao);

        linha.append(codigo, nome, status, acoes);
        corpo.append(linha);
    }

    desenharSeletorEmpresas();
}

/** Buscar na lista já carregada a empresa do código informado. */
function empresaPorCodigo(codigo) {
    return estado.empresas.find((empresa) => empresa.codigo === codigo) || null;
}

/** Dizer se a empresa do código continua sendo a que está aberta no painel. */
function aindaSelecionada(codigo) {
    return estado.selecionada !== null && estado.selecionada.codigo === codigo;
}

/**
 * Abrir uma empresa no painel: preencher o cabeçalho, gravar o código na URL e carregar todos os blocos.
 * @param {string} codigo código da empresa escolhida
 */
function selecionarEmpresa(codigo) {
    const empresa = empresaPorCodigo(codigo);
    if (!empresa) return;

    estado.selecionada = empresa;
    estado.pontosPagina = 1;
    limparDadosDaEmpresa();

    porId('empresa-titulo').textContent = empresa.nome;
    porId('empresa-codigo-atual').textContent = empresa.codigo;
    porId('empresa-status').textContent = empresa.desativadaEm ? 'Desativada' : 'Ativa';
    porId('empresa-nome-atual').value = empresa.nome;
    porId('botao-status').textContent = empresa.desativadaEm ? 'Ativar empresa' : 'Desativar empresa';
    mensagem('mensagem-empresa', '');

    porId('seletor-empresa').value = empresa.codigo;

    const url = new URL(window.location.href);
    url.searchParams.set('empresa', empresa.codigo);
    window.history.replaceState(null, '', url);

    mostrar(porId('bloco-empresa'), true);

    carregarResumo();
    carregarCoordenadores();
    carregarFuncionarios();
    carregarPontos(1);
    carregarSolicitacoes();
    carregarBanco();
}

/**
 * Buscar o resumo da empresa e preencher os contadores do topo.
 *
 * Descartar a resposta quando a empresa trocou no meio da requisição evita
 * número de uma empresa no cartão da outra.
 */
async function carregarResumo() {
    const empresa = estado.selecionada;
    if (!empresa) return;

    try {
        const resumo = (await api(`/api/admin/empresas/${encodeURIComponent(empresa.codigo)}/resumo`)) ?? {};
        if (!aindaSelecionada(empresa.codigo)) return;

        porId('resumo-funcionarios').textContent = String(resumo.funcionarios ?? 0);
        porId('resumo-coordenadores').textContent = String(resumo.coordenadores ?? 0);
        porId('resumo-pontos').textContent = String(resumo.pontos ?? 0);
        porId('resumo-pendentes').textContent = String(resumo.solicitacoesPendentes ?? 0);
        porId('resumo-ultimo-ponto').textContent = formatarDataHora(resumo.ultimoPonto);
    } catch (erro) {
        if (!aindaSelecionada(empresa.codigo)) return;
        mensagem('mensagem-empresa', erro.message);
    }
}

/**
 * Buscar os coordenadores da empresa e montar as linhas com redefinir senha e impersonar.
 */
async function carregarCoordenadores() {
    const empresa = estado.selecionada;
    if (!empresa) return;

    try {
        const lista = (await api(`/api/admin/empresas/${encodeURIComponent(empresa.codigo)}/coordenadores`)) ?? [];
        if (!aindaSelecionada(empresa.codigo)) return;

        const corpo = porId('tabela-coordenadores');
        corpo.textContent = '';
        if (lista.length === 0) {
            linhaVazia(corpo, 4, 'Nenhum coordenador cadastrado.');
            return;
        }

        for (const coordenador of lista) {
            const linha = document.createElement('tr');
            const acoes = celulaAcoes();

            const senha = botaoAcao('Redefinir senha');
            senha.addEventListener('click', () => redefinirSenha(coordenador.id, senha));

            const token = botaoAcao('Impersonar');
            token.addEventListener('click', () => impersonar(coordenador.id, token));

            acoes.append(senha, token);
            linha.append(
                celulaTexto(coordenador.usuario),
                celulaTexto(coordenador.nome),
                celulaTexto(coordenador.email),
                acoes
            );
            corpo.append(linha);
        }
    } catch (erro) {
        if (!aindaSelecionada(empresa.codigo)) return;
        mensagem('mensagem-empresa', erro.message);
    }
}

/**
 * Preencher o filtro de funcionários sem perder a escolha atual quando ela ainda existe na lista.
 * @param {object[]} lista funcionários da empresa
 */
function desenharSeletorFuncionarios(lista) {
    const seletor = porId('ponto-funcionario');
    const atual = seletor.value;
    seletor.textContent = '';

    const todos = document.createElement('option');
    todos.value = '';
    todos.textContent = 'Todos';
    seletor.append(todos);

    for (const funcionario of lista) {
        const opcao = document.createElement('option');
        opcao.value = String(funcionario.id);
        opcao.textContent = funcionario.nome;
        seletor.append(opcao);
    }

    seletor.value = lista.some((funcionario) => String(funcionario.id) === atual) ? atual : '';
}

/**
 * Buscar os funcionários da empresa e montar a tabela com edição em linha e exclusão confirmada pelo nome.
 */
async function carregarFuncionarios() {
    const empresa = estado.selecionada;
    if (!empresa) return;

    try {
        const lista = (await api(`/api/admin/empresas/${encodeURIComponent(empresa.codigo)}/funcionarios`)) ?? [];
        if (!aindaSelecionada(empresa.codigo)) return;

        const corpo = porId('tabela-funcionarios');
        corpo.textContent = '';
        if (lista.length === 0) {
            linhaVazia(corpo, 4, 'Nenhum funcionário cadastrado.');
        } else {
            for (const funcionario of lista) {
                const linha = document.createElement('tr');
                const acoes = celulaAcoes();

                const editar = botaoAcao('Editar');
                editar.addEventListener('click', () => editarFuncionario(funcionario, linha));

                const apagar = botaoAcao('Apagar', 'perigo');
                apagar.addEventListener('click', () =>
                    apagarFuncionario(funcionario.id, funcionario.nome, apagar)
                );

                acoes.append(editar, apagar);
                linha.append(
                    celulaTexto(funcionario.nome),
                    celulaTexto(funcionario.numero),
                    celulaTexto(funcionario.email),
                    acoes
                );
                corpo.append(linha);
            }
        }

        desenharSeletorFuncionarios(lista);
    } catch (erro) {
        if (!aindaSelecionada(empresa.codigo)) return;
        mensagem('mensagem-empresa', erro.message);
    }
}

/**
 * Buscar a página de pontos com os filtros ativos e atualizar a tabela e a navegação.
 * @param {number} [pagina] página pedida, 1 por padrão
 */
async function carregarPontos(pagina = 1) {
    const empresa = estado.selecionada;
    if (!empresa) return;

    const parametros = new URLSearchParams();
    const funcionarioId = porId('ponto-funcionario').value;
    if (funcionarioId) parametros.set('funcionarioId', funcionarioId);
    const de = porId('ponto-de').value;
    if (de) parametros.set('de', de);
    const ate = porId('ponto-ate').value;
    if (ate) parametros.set('ate', ate);
    const limite = porId('ponto-limite').value;
    if (limite) parametros.set('limite', limite);
    parametros.set('pagina', String(pagina));

    try {
        const dados =
            (await api(`/api/admin/empresas/${encodeURIComponent(empresa.codigo)}/pontos?${parametros}`)) ?? {};
        if (!aindaSelecionada(empresa.codigo)) return;

        const pontos = Array.isArray(dados.pontos) ? dados.pontos : [];
        const paginas = Number(dados.paginas) || 0;
        const paginaAtual = Number(dados.pagina) || 1;
        const total = Number(dados.total) || 0;

        estado.pontosPagina = paginaAtual;
        estado.pontosPaginas = paginas;

        const corpo = porId('tabela-pontos');
        corpo.textContent = '';
        if (pontos.length === 0) {
            linhaVazia(corpo, 3, 'Nenhum ponto no filtro.');
        } else {
            for (const ponto of pontos) {
                const linha = document.createElement('tr');
                linha.append(
                    celulaTexto(ponto.funcionarioNome),
                    celulaTexto(formatarDataHora(ponto.dataHora)),
                    celulaTexto(ponto.tipo)
                );
                corpo.append(linha);
            }
        }

        porId('ponto-paginacao').textContent =
            paginas === 0
                ? 'Nenhum ponto encontrado.'
                : `Página ${paginaAtual} de ${paginas}, ${total === 1 ? '1 ponto' : `${total} pontos`}.`;
        porId('ponto-anterior').disabled = paginaAtual <= 1;
        porId('ponto-proximo').disabled = paginas === 0 || paginaAtual >= paginas;
    } catch (erro) {
        if (!aindaSelecionada(empresa.codigo)) return;
        mensagem('mensagem-empresa', erro.message);
    }
}

const VAZIO_POR_STATUS = {
    pendente: 'Nenhum pedido pendente.',
    aprovado: 'Nenhum pedido aprovado.',
    recusado: 'Nenhum pedido recusado.',
};

/**
 * Buscar os pedidos do status escolhido e montar a tabela, com aprovar e recusar apenas nos pendentes.
 */
async function carregarSolicitacoes() {
    const empresa = estado.selecionada;
    if (!empresa) return;

    const status = porId('solicitacao-status').value || 'pendente';

    try {
        const dados =
            (await api(
                `/api/admin/empresas/${encodeURIComponent(empresa.codigo)}/solicitacoes?status=${encodeURIComponent(status)}`
            )) ?? {};
        if (!aindaSelecionada(empresa.codigo)) return;

        const solicitacoes = Array.isArray(dados.solicitacoes) ? dados.solicitacoes : [];
        const corpo = porId('tabela-solicitacoes');
        corpo.textContent = '';
        if (solicitacoes.length === 0) {
            linhaVazia(corpo, 5, VAZIO_POR_STATUS[status] ?? 'Nenhum pedido.');
            return;
        }

        for (const solicitacao of solicitacoes) {
            const linha = document.createElement('tr');
            const acoes = celulaAcoes();

            // Pedido já decidido não tem ação: aprovar de novo ou recusar de
            // novo só devolveria erro do serviço.
            if (solicitacao.status === 'pendente') {
                const aprovar = botaoAcao('Aprovar');
                aprovar.addEventListener('click', () => aprovarSolicitacao(solicitacao.id, aprovar));

                const recusar = botaoAcao('Recusar', 'perigo');
                recusar.addEventListener('click', () => recusarSolicitacao(solicitacao.id, recusar));

                acoes.append(aprovar, recusar);
            }

            linha.append(
                celulaTexto(solicitacao.usuario),
                celulaTexto(solicitacao.nome),
                celulaTexto(solicitacao.email),
                celulaTexto(formatarDataHora(solicitacao.criadoEm)),
                acoes
            );
            corpo.append(linha);
        }
    } catch (erro) {
        if (!aindaSelecionada(empresa.codigo)) return;
        mensagem('mensagem-empresa', erro.message);
    }
}

/** Buscar versão e tamanho do banco da empresa e mostrar no cartão de banco. */
async function carregarBanco() {
    const empresa = estado.selecionada;
    if (!empresa) return;

    try {
        const info = (await api(`/api/admin/empresas/${encodeURIComponent(empresa.codigo)}/banco`)) ?? {};
        if (!aindaSelecionada(empresa.codigo)) return;

        porId('banco-versao').textContent =
            info.versao === undefined || info.versao === null ? '' : String(info.versao);
        porId('banco-tamanho').textContent = formatarTamanho(info.tamanhoBytes);
    } catch (erro) {
        if (!aindaSelecionada(empresa.codigo)) return;
        mensagem('mensagem-empresa', erro.message);
    }
}

/**
 * Montar a rota de uma empresa com o código já escapado para a URL.
 * @param {object} empresa
 * @param {string} [sufixo] parte final da rota
 * @returns {string}
 */
function caminhoDaEmpresa(empresa, sufixo = '') {
    return `/api/admin/empresas/${encodeURIComponent(empresa.codigo)}${sufixo}`;
}

// Volta para a lista de empresas quando a empresa em atendimento deixou de
// existir, limpando a seleção e o parâmetro da URL.
/** Limpar a empresa aberta e apagar o parâmetro empresa da URL, devolvendo a tela para a lista. */
function voltarParaLista() {
    estado.selecionada = null;
    estado.pontosPagina = 1;
    estado.pontosPaginas = 0;
    limparDadosDaEmpresa();
    mostrar(porId('bloco-empresa'), false);
    porId('seletor-empresa').value = '';
    porId('empresa-titulo').textContent = '';
    porId('empresa-codigo-atual').textContent = '';
    porId('empresa-status').textContent = '';
    porId('empresa-nome-atual').value = '';
    mensagem('mensagem-empresa', '');

    const url = new URL(window.location.href);
    url.searchParams.delete('empresa');
    window.history.replaceState(null, '', url);
}

/**
 * Pedir a nova senha do coordenador, conferir o mínimo local e enviar para a API.
 *
 * A checagem local só evita uma ida ao servidor, que confere de novo. A troca
 * sobe a versão da senha e derruba os tokens antigos do coordenador.
 * @param {number} id id do coordenador
 * @param {HTMLButtonElement} botao botão que fica desabilitado durante a chamada
 * @returns {Promise<void>}
 */
async function redefinirSenha(id, botao) {
    const empresa = estado.selecionada;
    if (!empresa) return;

    // O prompt não esconde o que é digitado, então a mensagem avisa antes.
    const digitada = window.prompt(
        'Nova senha do coordenador. O que você digitar fica visível na tela, então evite fazer isso com alguém olhando.'
    );
    if (digitada === null) return;
    if (digitada.length < MINIMO_SENHA) {
        mensagem('mensagem-empresa', `A senha precisa ter ao menos ${MINIMO_SENHA} caracteres.`);
        return;
    }

    mensagem('mensagem-empresa', '');
    await comBotao(botao, async () => {
        try {
            await api(caminhoDaEmpresa(empresa, `/coordenadores/${id}/senha`), {
                method: 'POST',
                corpo: { senha: digitada },
            });
            if (!aindaSelecionada(empresa.codigo)) return;
            mensagem('mensagem-empresa', 'Senha redefinida. Os tokens antigos do coordenador deixaram de valer.', 'ok');
            carregarCoordenadores();
        } catch (erro) {
            if (!aindaSelecionada(empresa.codigo)) return;
            mensagem('mensagem-empresa', erro.message);
        }
    });
}

/**
 * Gerar um token de acesso para o coordenador e mostrar uma única vez, já que o painel não guarda o token.
 *
 * A API registra a impersonação na auditoria, com o usuário do painel e a
 * empresa usada.
 * @param {number} id id do coordenador
 * @param {HTMLButtonElement} botao botão que fica desabilitado durante a chamada
 * @returns {Promise<void>}
 */
async function impersonar(id, botao) {
    const empresa = estado.selecionada;
    if (!empresa) return;
    mensagem('mensagem-empresa', '');

    await comBotao(botao, async () => {
        try {
            const dados =
                (await api(caminhoDaEmpresa(empresa, `/coordenadores/${id}/impersonar`), { method: 'POST' })) ?? {};
            if (!aindaSelecionada(empresa.codigo)) return;

            const horas = dados.expiraEmHoras ?? 12;
            mensagem('mensagem-empresa', `Token de ${dados.usuario ?? 'coordenador'} gerado.`, 'ok');
            window.prompt(
                `Token de acesso do coordenador ${dados.usuario ?? ''}. Ele expira em ${horas} horas. Copie agora, porque o painel não guarda o token.`,
                dados.token ?? ''
            );
        } catch (erro) {
            if (!aindaSelecionada(empresa.codigo)) return;
            mensagem('mensagem-empresa', erro.message);
        }
    });
}

// A edição troca o conteúdo da linha por campos de nome, número e email. O
// Cancelar só redesenha a lista, então nada é enviado ao servidor.
/**
 * Trocar o conteúdo da linha por campos de nome, número e email, com salvar e cancelar.
 * @param {object} funcionario dados atuais da linha
 * @param {HTMLTableRowElement} linha linha que vira formulário
 */
function editarFuncionario(funcionario, linha) {
    const empresa = estado.selecionada;
    if (!empresa) return;
    mensagem('mensagem-empresa', '');

    /**
     * Criar um input com o valor atual, o limite de caracteres e o tipo pedido.
     * @param {string|null} valor
     * @param {object} [opcoes] maximo e tipo
     * @returns {HTMLInputElement}
     */
    const campo = (valor, opcoes = {}) => {
        const entrada = document.createElement('input');
        entrada.value = valor === null || valor === undefined ? '' : String(valor);
        entrada.maxLength = opcoes.maximo ?? 120;
        if (opcoes.tipo) entrada.type = opcoes.tipo;
        return entrada;
    };

    const entradaNome = campo(funcionario.nome, { maximo: 120 });
    const entradaNumero = campo(funcionario.numero, { maximo: 40 });
    const entradaEmail = campo(funcionario.email, { maximo: 160, tipo: 'email' });

    /**
     * Embrulhar um input numa célula de tabela.
     * @param {HTMLInputElement} entrada
     * @returns {HTMLTableCellElement}
     */
    const celulaCampo = (entrada) => {
        const celula = document.createElement('td');
        celula.append(entrada);
        return celula;
    };

    const acoes = celulaAcoes();
    const salvar = botaoAcao('Salvar');
    const cancelar = botaoAcao('Cancelar');
    acoes.append(salvar, cancelar);

    linha.textContent = '';
    linha.append(celulaCampo(entradaNome), celulaCampo(entradaNumero), celulaCampo(entradaEmail), acoes);
    entradaNome.focus();

    cancelar.addEventListener('click', () => carregarFuncionarios());

    salvar.addEventListener('click', async () => {
        await comBotao(salvar, async () => {
            try {
                await api(caminhoDaEmpresa(empresa, `/funcionarios/${funcionario.id}`), {
                    method: 'PATCH',
                    corpo: {
                        nome: entradaNome.value,
                        numero: entradaNumero.value,
                        email: entradaEmail.value,
                    },
                });
                if (!aindaSelecionada(empresa.codigo)) return;
                mensagem('mensagem-empresa', 'Funcionário atualizado.', 'ok');
                carregarFuncionarios();
            } catch (erro) {
                if (!aindaSelecionada(empresa.codigo)) return;
                mensagem('mensagem-empresa', erro.message);
            }
        });
    });
}

/**
 * Apagar o funcionário e os pontos dele depois da confirmação pelo nome digitado.
 *
 * Nome diferente do cadastro encerra o fluxo sem tocar na API, e a exclusão no
 * servidor remove pontos e usuário na mesma transação.
 * @param {number} id id do funcionário
 * @param {string} nome nome usado na confirmação
 * @param {HTMLButtonElement} botao botão que fica desabilitado durante a chamada
 * @returns {Promise<void>}
 */
async function apagarFuncionario(id, nome, botao) {
    const empresa = estado.selecionada;
    if (!empresa) return;

    const alvo = nome === null || nome === undefined ? '' : String(nome).trim();
    const digitado = window.prompt(
        `Apagar ${alvo || 'este funcionário'} apaga também os pontos dele, sem volta. Para confirmar, digite o nome do funcionário.`
    );
    if (digitado === null) return;
    if (digitado.trim() !== alvo) {
        mensagem('mensagem-empresa', 'O nome digitado não confere. Nada foi apagado.');
        return;
    }

    mensagem('mensagem-empresa', '');
    await comBotao(botao, async () => {
        try {
            await api(caminhoDaEmpresa(empresa, `/funcionarios/${id}`), { method: 'DELETE' });
            if (!aindaSelecionada(empresa.codigo)) return;
            mensagem('mensagem-empresa', 'Funcionário apagado com os pontos dele.', 'ok');
            carregarFuncionarios();
            carregarPontos(1);
            carregarResumo();
        } catch (erro) {
            if (!aindaSelecionada(empresa.codigo)) return;
            mensagem('mensagem-empresa', erro.message);
        }
    });
}

/**
 * Aprovar ou recusar um pedido depois da confirmação e recarregar tabela, resumo e funcionários.
 * @param {number} id id do pedido
 * @param {string} decisao aprovar ou recusar
 * @param {HTMLButtonElement} botao botão que fica desabilitado durante a chamada
 * @returns {Promise<void>}
 */
async function decidirSolicitacao(id, decisao, botao) {
    const empresa = estado.selecionada;
    if (!empresa) return;

    const pergunta =
        decisao === 'aprovar'
            ? 'Aprovar este pedido? O funcionário é criado e o aviso por email sai agora.'
            : 'Recusar este pedido? O login do pedido fica bloqueado.';
    if (!window.confirm(pergunta)) return;

    mensagem('mensagem-empresa', '');
    await comBotao(botao, async () => {
        try {
            await api(caminhoDaEmpresa(empresa, `/solicitacoes/${id}/${decisao}`), { method: 'POST' });
            if (!aindaSelecionada(empresa.codigo)) return;
            mensagem('mensagem-empresa', decisao === 'aprovar' ? 'Pedido aprovado.' : 'Pedido recusado.', 'ok');
            carregarSolicitacoes();
            carregarResumo();
            if (decisao === 'aprovar') carregarFuncionarios();
        } catch (erro) {
            if (!aindaSelecionada(empresa.codigo)) return;
            mensagem('mensagem-empresa', erro.message);
        }
    });
}

/** Encaminhar o pedido para a decisão de aprovação. */
function aprovarSolicitacao(id, botao) {
    return decidirSolicitacao(id, 'aprovar', botao);
}

/** Encaminhar o pedido para a decisão de recusa. */
function recusarSolicitacao(id, botao) {
    return decidirSolicitacao(id, 'recusar', botao);
}

/**
 * Baixar o backup do banco da empresa, que o servidor gera com VACUUM INTO num diretório temporário.
 * @param {HTMLButtonElement} botao botão que fica desabilitado durante o download
 * @returns {Promise<void>}
 */
async function baixarBackup(botao) {
    const empresa = estado.selecionada;
    if (!empresa) return;
    mensagem('mensagem-empresa', '');

    await comBotao(botao, async () => {
        try {
            await baixarArquivo(
                caminhoDaEmpresa(empresa, '/banco/backup'),
                `klok-${empresa.codigo}-${new Date().toISOString().slice(0, 10)}.db`
            );
            if (!aindaSelecionada(empresa.codigo)) return;
            mensagem('mensagem-empresa', 'Backup baixado.', 'ok');
        } catch (erro) {
            if (!aindaSelecionada(empresa.codigo)) return;
            mensagem('mensagem-empresa', erro.message);
        }
    });
}

/**
 * Enviar o arquivo escolhido para restaurar o banco depois de digitar o código da empresa.
 *
 * A digitação do código é a confirmação local, e o código segue também no
 * cabeçalho de confirmação da requisição. O servidor confere o arquivo, troca o
 * banco e guarda o anterior em disco.
 * @param {HTMLButtonElement} botao botão que fica desabilitado durante o envio
 * @returns {Promise<void>}
 */
async function restaurarBackup(botao) {
    const empresa = estado.selecionada;
    if (!empresa) return;

    const arquivo = porId('arquivo-restaurar').files?.[0];
    if (!arquivo) {
        mensagem('mensagem-empresa', 'Escolha o arquivo do backup antes de restaurar.');
        return;
    }

    const digitado = window.prompt(
        `Restaurar substitui o banco da empresa ${empresa.codigo} e não tem volta. Para confirmar, digite o código da empresa.`
    );
    if (digitado === null) return;
    if (digitado.trim().toUpperCase() !== empresa.codigo) {
        mensagem('mensagem-empresa', 'O código digitado não confere. Nada foi alterado.');
        return;
    }

    mensagem('mensagem-empresa', '');
    await comBotao(botao, async () => {
        try {
            const dados = await enviarArquivo(
                caminhoDaEmpresa(empresa, '/banco/restaurar'),
                arquivo,
                empresa.codigo
            );
            if (!aindaSelecionada(empresa.codigo)) return;

            porId('arquivo-restaurar').value = '';
            mensagem(
                'mensagem-empresa',
                `Backup restaurado na versão ${dados?.versao ?? '?'}. O banco anterior ficou guardado no disco.`,
                'ok'
            );
            carregarResumo();
            carregarCoordenadores();
            carregarFuncionarios();
            carregarPontos(1);
            carregarSolicitacoes();
            carregarBanco();
        } catch (erro) {
            if (!aindaSelecionada(empresa.codigo)) return;
            mensagem('mensagem-empresa', erro.message);
        }
    });
}

/**
 * Apagar a empresa e o banco dela depois de digitar o código, devolvendo a tela para a lista.
 *
 * O código digitado vai também no cabeçalho de confirmação da requisição.
 * @param {HTMLButtonElement} botao botão que fica desabilitado durante a chamada
 * @returns {Promise<void>}
 */
async function apagarEmpresa(botao) {
    const empresa = estado.selecionada;
    if (!empresa) return;

    const digitado = window.prompt(
        `Apagar a empresa ${empresa.codigo} remove o banco dela e não tem volta. Para confirmar, digite o código da empresa.`
    );
    if (digitado === null) return;
    if (digitado.trim().toUpperCase() !== empresa.codigo) {
        mensagem('mensagem-empresa', 'O código digitado não confere. Nada foi apagado.');
        return;
    }

    mensagem('mensagem-empresa', '');
    await comBotao(botao, async () => {
        try {
            await api(caminhoDaEmpresa(empresa), {
                method: 'DELETE',
                headers: { 'x-confirmar-codigo': empresa.codigo },
            });
            estado.empresas = estado.empresas.filter((item) => item.codigo !== empresa.codigo);
            voltarParaLista();
            desenharEmpresas();
            mensagem('mensagem-empresas', `Empresa ${empresa.codigo} apagada.`, 'ok');
        } catch (erro) {
            if (!aindaSelecionada(empresa.codigo)) return;
            mensagem('mensagem-empresa', erro.message);
        }
    });
}

/**
 * Baixar o CSV de funcionários ou de pontos, respeitando os filtros da tabela de pontos.
 *
 * O servidor corta a exportação de pontos em 10000 linhas.
 * @param {string} tipo funcionarios ou pontos
 * @param {HTMLButtonElement} botao botão que fica desabilitado durante o download
 * @returns {Promise<void>}
 */
async function baixarCsv(tipo, botao) {
    const empresa = estado.selecionada;
    if (!empresa) return;

    let caminho;
    let padrao;
    if (tipo === 'funcionarios') {
        caminho = caminhoDaEmpresa(empresa, '/funcionarios.csv');
        padrao = `klok-${empresa.codigo}-funcionarios.csv`;
    } else {
        // O CSV de pontos respeita os mesmos filtros da tabela de Pontos.
        const parametros = new URLSearchParams();
        const funcionarioId = porId('ponto-funcionario').value;
        if (funcionarioId) parametros.set('funcionarioId', funcionarioId);
        const de = porId('ponto-de').value;
        if (de) parametros.set('de', de);
        const ate = porId('ponto-ate').value;
        if (ate) parametros.set('ate', ate);
        const consulta = parametros.toString();
        caminho = caminhoDaEmpresa(empresa, `/pontos.csv${consulta ? `?${consulta}` : ''}`);
        padrao = `klok-${empresa.codigo}-pontos.csv`;
    }

    mensagem('mensagem-empresa', '');
    await comBotao(botao, async () => {
        try {
            await baixarArquivo(caminho, padrao);
            if (!aindaSelecionada(empresa.codigo)) return;
            mensagem('mensagem-empresa', 'Arquivo baixado.', 'ok');
        } catch (erro) {
            if (!aindaSelecionada(empresa.codigo)) return;
            mensagem('mensagem-empresa', erro.message);
        }
    });
}

/**
 * Substituir ou incluir a empresa no estado, reordenar por código e abrir a empresa atualizada.
 * @param {object} empresa empresa devolvida pela API
 */
function atualizarNaLista(empresa) {
    const indice = estado.empresas.findIndex((item) => item.codigo === empresa.codigo);
    if (indice >= 0) estado.empresas[indice] = empresa;
    else estado.empresas.push(empresa);
    estado.empresas.sort((a, b) => a.codigo.localeCompare(b.codigo));
    desenharEmpresas();
    selecionarEmpresa(empresa.codigo);
}

/**
 * Buscar a lista de empresas, desenhar a tabela e abrir a empresa que veio no parâmetro da URL.
 */
async function carregarEmpresas() {
    try {
        const lista = (await api('/api/admin/empresas')) ?? [];
        estado.empresas = Array.isArray(lista) ? lista : [];
        desenharEmpresas();

        const daUrl = new URL(window.location.href).searchParams.get('empresa');
        if (daUrl && empresaPorCodigo(daUrl)) selecionarEmpresa(daUrl);
    } catch (erro) {
        mensagem('mensagem-empresas', erro.message);
    }
}

porId('form-login').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mensagem('mensagem-login', '');

    try {
        await api('/api/admin/login', {
            method: 'POST',
            corpo: {
                usuario: porId('login-usuario').value,
                senha: porId('login-senha').value,
            },
        });
        estado.csrf = csrfDoCookie();
        porId('login-usuario').value = '';
        entrarNoPainel();
    } catch (erro) {
        mensagem('mensagem-login', erro.message);
    }
});

porId('botao-sair').addEventListener('click', () => sair(''));

porId('form-empresa').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mensagem('mensagem-empresas', '');

    try {
        const criada = await api('/api/admin/empresas', {
            method: 'POST',
            corpo: {
                codigo: porId('empresa-codigo').value,
                nome: porId('empresa-nome').value,
            },
        });
        porId('form-empresa').reset();
        mensagem('mensagem-empresas', `Empresa ${criada.codigo} criada. Agora crie o coordenador.`, 'ok');
        atualizarNaLista(criada);
    } catch (erro) {
        mensagem('mensagem-empresas', erro.message);
    }
});

porId('lista-empresas').addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-codigo]');
    if (!botao) return;
    selecionarEmpresa(botao.dataset.codigo);
});

porId('seletor-empresa').addEventListener('change', (evento) => {
    const codigo = evento.target.value;
    if (codigo) {
        selecionarEmpresa(codigo);
    } else if (estado.selecionada) {
        evento.target.value = estado.selecionada.codigo;
    }
});

porId('form-renomear').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!estado.selecionada) return;
    mensagem('mensagem-empresa', '');

    try {
        const atualizada = await api(`/api/admin/empresas/${estado.selecionada.codigo}`, {
            method: 'PATCH',
            corpo: { nome: porId('empresa-nome-atual').value },
        });
        atualizarNaLista(atualizada);
        mensagem('mensagem-empresa', 'Nome atualizado.', 'ok');
    } catch (erro) {
        mensagem('mensagem-empresa', erro.message);
    }
});

porId('botao-status').addEventListener('click', async () => {
    if (!estado.selecionada) return;
    mensagem('mensagem-empresa', '');

    try {
        const atualizada = await api(`/api/admin/empresas/${estado.selecionada.codigo}`, {
            method: 'PATCH',
            corpo: { ativa: !!estado.selecionada.desativadaEm },
        });
        atualizarNaLista(atualizada);
        mensagem('mensagem-empresa', atualizada.desativadaEm ? 'Empresa desativada.' : 'Empresa ativada.', 'ok');
    } catch (erro) {
        mensagem('mensagem-empresa', erro.message);
    }
});

porId('form-coordenador').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!estado.selecionada) return;
    mensagem('mensagem-empresa', '');

    try {
        const criado = await api(`/api/admin/empresas/${estado.selecionada.codigo}/coordenador`, {
            method: 'POST',
            corpo: {
                usuario: porId('coord-usuario').value,
                senha: porId('coord-senha').value,
                nome: porId('coord-nome').value,
                email: porId('coord-email').value,
                numero: porId('coord-numero').value,
            },
        });
        porId('form-coordenador').reset();
        mensagem(
            'mensagem-empresa',
            `Coordenador ${criado.usuario} criado. Ele já entra com o código ${criado.empresa}.`,
            'ok'
        );
        carregarCoordenadores();
        carregarResumo();
    } catch (erro) {
        mensagem('mensagem-empresa', erro.message);
    }
});

porId('filtro-pontos').addEventListener('submit', (evento) => {
    evento.preventDefault();
    carregarPontos(1);
});

porId('ponto-anterior').addEventListener('click', () => {
    if (estado.pontosPagina <= 1) return;
    carregarPontos(estado.pontosPagina - 1);
});

porId('ponto-proximo').addEventListener('click', () => {
    if (estado.pontosPaginas === 0 || estado.pontosPagina >= estado.pontosPaginas) return;
    carregarPontos(estado.pontosPagina + 1);
});

porId('solicitacao-status').addEventListener('change', () => {
    carregarSolicitacoes();
});

porId('botao-backup').addEventListener('click', (evento) => baixarBackup(evento.currentTarget));

porId('botao-restaurar').addEventListener('click', (evento) => restaurarBackup(evento.currentTarget));

porId('botao-csv-funcionarios').addEventListener('click', (evento) =>
    baixarCsv('funcionarios', evento.currentTarget)
);

porId('botao-csv-pontos').addEventListener('click', (evento) => baixarCsv('pontos', evento.currentTarget));

porId('botao-apagar-empresa').addEventListener('click', (evento) => apagarEmpresa(evento.currentTarget));

// O cookie de CSRF sobrevive ao recarregar a página: se ele existe, tentamos
// abrir o painel direto e o primeiro 401 devolve o login.
estado.csrf = csrfDoCookie();
if (estado.csrf) {
    entrarNoPainel();
} else {
    sair('');
}
