const CHAVE_TOKEN = 'klok_admin_token';

const estado = {
    token: sessionStorage.getItem(CHAVE_TOKEN) || '',
    empresas: [],
    selecionada: null,
};

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

// O token fica em sessionStorage de propósito: é o painel interno da KLOK e a
// sessão morre ao fechar a aba. Cookie httpOnly com CSRF seria mais forte, e é
// o próximo passo se o painel crescer.
async function api(caminho, { method = 'GET', corpo } = {}) {
    const resp = await fetch(caminho, {
        method,
        headers: {
            ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
            ...(estado.token ? { authorization: `Bearer ${estado.token}` } : {}),
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
        sair('Sessão expirada, entre de novo.');
        throw new Error('Sessão expirada, entre de novo.');
    }
    if (!resp.ok) {
        throw new Error(dados?.erro || 'Falha na requisição');
    }
    return dados;
}

function sair(texto) {
    estado.token = '';
    estado.empresas = [];
    estado.selecionada = null;
    sessionStorage.removeItem(CHAVE_TOKEN);
    mostrar(porId('bloco-painel'), false);
    mostrar(porId('botao-sair'), false);
    mostrar(porId('bloco-login'), true);
    mostrar(porId('bloco-empresa'), false);
    mensagem('mensagem-login', texto || '', texto ? 'erro' : '');
}

function entrarNoPainel() {
    mostrar(porId('bloco-login'), false);
    mostrar(porId('bloco-painel'), true);
    mostrar(porId('botao-sair'), true);
    porId('login-senha').value = '';
    mensagem('mensagem-login', '');
    carregarEmpresas();
}

function desenharEmpresas() {
    const corpo = porId('lista-empresas');
    corpo.textContent = '';

    if (estado.empresas.length === 0) {
        const linha = document.createElement('tr');
        const celula = document.createElement('td');
        celula.colSpan = 4;
        celula.textContent = 'Nenhuma empresa ainda.';
        linha.append(celula);
        corpo.append(linha);
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
}

function empresaPorCodigo(codigo) {
    return estado.empresas.find((empresa) => empresa.codigo === codigo) || null;
}

function selecionarEmpresa(codigo) {
    const empresa = empresaPorCodigo(codigo);
    if (!empresa) return;

    estado.selecionada = empresa;
    porId('empresa-titulo').textContent = empresa.nome;
    porId('empresa-codigo-atual').textContent = empresa.codigo;
    porId('empresa-status').textContent = empresa.desativadaEm ? 'Desativada' : 'Ativa';
    porId('empresa-nome-atual').value = empresa.nome;
    porId('botao-status').textContent = empresa.desativadaEm ? 'Ativar empresa' : 'Desativar empresa';
    mensagem('mensagem-empresa', '');

    const url = new URL(window.location.href);
    url.searchParams.set('empresa', empresa.codigo);
    window.history.replaceState(null, '', url);

    mostrar(porId('bloco-empresa'), true);
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
        estado.empresas = await api('/api/admin/empresas');
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
        const dados = await api('/api/admin/login', {
            method: 'POST',
            corpo: {
                usuario: porId('login-usuario').value,
                senha: porId('login-senha').value,
            },
        });
        estado.token = dados.token;
        sessionStorage.setItem(CHAVE_TOKEN, dados.token);
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
    } catch (erro) {
        mensagem('mensagem-empresa', erro.message);
    }
});

if (estado.token) {
    entrarNoPainel();
} else {
    sair('');
}
