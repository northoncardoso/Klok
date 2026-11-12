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

function porId(id) {
    return document.getElementById(id);
}

function mostrar(elemento, visivel) {
    elemento.hidden = !visivel;
}

function mensagem(id, texto, tipo = 'erro') {
    const alvo = porId(id);
    alvo.textContent = texto;
    alvo.dataset.tipo = tipo;
}

function csrfDoCookie() {
    const par = document.cookie
        .split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith('klok_csrf='));
    return par ? par.slice('klok_csrf='.length) : '';
}

function formatarDataHora(valor) {
    if (!valor) return 'nenhum';
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return String(valor);
    return FORMATO_DATA_HORA.format(data);
}

function formatarTamanho(bytes) {
    if (!Number.isFinite(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${FORMATO_NUMERO.format(kb)} KB`;
    return `${FORMATO_NUMERO.format(kb / 1024)} MB`;
}

// Download de CSV e de backup não pode ser link direto: o CSRF vale também no
// GET, então o arquivo precisa sair por fetch com credentials, o header
// x-csrf-token e a resposta virada em blob com link temporário. As ações de
// download entram na Task 14.
async function api(caminho, { method = 'GET', corpo } = {}) {
    const resp = await fetch(caminho, {
        method,
        credentials: 'same-origin',
        headers: {
            ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
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

function celulaTexto(valor) {
    const celula = document.createElement('td');
    celula.textContent = valor === null || valor === undefined ? '' : String(valor);
    return celula;
}

function celulaAcoes() {
    // As ações de cada linha entram na Task 14.
    return document.createElement('td');
}

function linhaVazia(corpo, colunas, texto) {
    const linha = document.createElement('tr');
    const celula = document.createElement('td');
    celula.colSpan = colunas;
    celula.textContent = texto;
    linha.append(celula);
    corpo.append(linha);
}

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
    porId('ponto-paginacao').textContent = '';
    estado.pontosPagina = 1;
    estado.pontosPaginas = 0;
    porId('ponto-anterior').disabled = true;
    porId('ponto-proximo').disabled = true;
}

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

function entrarNoPainel() {
    mostrar(porId('bloco-login'), false);
    mostrar(porId('bloco-painel'), true);
    mostrar(porId('botao-sair'), true);
    porId('login-senha').value = '';
    mensagem('mensagem-login', '');
    carregarEmpresas();
}

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

function empresaPorCodigo(codigo) {
    return estado.empresas.find((empresa) => empresa.codigo === codigo) || null;
}

function aindaSelecionada(codigo) {
    return estado.selecionada !== null && estado.selecionada.codigo === codigo;
}

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
            linha.append(
                celulaTexto(coordenador.usuario),
                celulaTexto(coordenador.nome),
                celulaTexto(coordenador.email),
                celulaAcoes()
            );
            corpo.append(linha);
        }
    } catch (erro) {
        if (!aindaSelecionada(empresa.codigo)) return;
        mensagem('mensagem-empresa', erro.message);
    }
}

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
                linha.append(
                    celulaTexto(funcionario.nome),
                    celulaTexto(funcionario.numero),
                    celulaTexto(funcionario.email),
                    celulaAcoes()
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
            linha.append(
                celulaTexto(solicitacao.usuario),
                celulaTexto(solicitacao.nome),
                celulaTexto(solicitacao.email),
                celulaTexto(formatarDataHora(solicitacao.criadoEm)),
                celulaAcoes()
            );
            corpo.append(linha);
        }
    } catch (erro) {
        if (!aindaSelecionada(empresa.codigo)) return;
        mensagem('mensagem-empresa', erro.message);
    }
}

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

function atualizarNaLista(empresa) {
    const indice = estado.empresas.findIndex((item) => item.codigo === empresa.codigo);
    if (indice >= 0) estado.empresas[indice] = empresa;
    else estado.empresas.push(empresa);
    estado.empresas.sort((a, b) => a.codigo.localeCompare(b.codigo));
    desenharEmpresas();
    selecionarEmpresa(empresa.codigo);
}

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

// O cookie de CSRF sobrevive ao recarregar a página: se ele existe, tentamos
// abrir o painel direto e o primeiro 401 devolve o login.
estado.csrf = csrfDoCookie();
if (estado.csrf) {
    entrarNoPainel();
} else {
    sair('');
}
