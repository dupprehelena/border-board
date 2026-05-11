// ══════════════════════════════════════════════════════════════
// NETLIFY FUNCTION — API para Relatórios
// Salva e carrega relatórios do arquivo relatorios.json
// ══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const RELATORIOS_FILE = path.join(__dirname, '../../relatorios.json');

// Função para ler relatórios
function lerRelatorios() {
  try {
    if (!fs.existsSync(RELATORIOS_FILE)) {
      return { relatorios: [], ultimaAtualizacao: new Date().toISOString(), versao: '1.0' };
    }
    const dados = fs.readFileSync(RELATORIOS_FILE, 'utf-8');
    return JSON.parse(dados);
  } catch (erro) {
    console.error('Erro ao ler relatórios:', erro);
    return { relatorios: [], ultimaAtualizacao: new Date().toISOString(), versao: '1.0' };
  }
}

// Função para salvar relatórios
function salvarRelatorios(dados) {
  try {
    fs.writeFileSync(RELATORIOS_FILE, JSON.stringify(dados, null, 2), 'utf-8');
    return true;
  } catch (erro) {
    console.error('Erro ao salvar relatórios:', erro);
    return false;
  }
}

// Handler principal
exports.handler = async (event) => {
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};

  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    // GET — Retorna todos os relatórios
    if (method === 'GET') {
      const dados = lerRelatorios();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(dados),
      };
    }

    // POST — Adiciona um novo relatório
    if (method === 'POST') {
      const dados = lerRelatorios();
      const novoRelatorio = {
        id: Date.now().toString(),
        data: body.data,
        titulo: body.titulo || 'Sem título',
        resumo: body.resumo || '',
        html: body.html || '',
        dataCriacao: new Date().toISOString(),
      };

      dados.relatorios.push(novoRelatorio);
      dados.ultimaAtualizacao = new Date().toISOString();

      if (salvarRelatorios(dados)) {
        return {
          statusCode: 201,
          headers,
          body: JSON.stringify({ sucesso: true, relatorio: novoRelatorio }),
        };
      } else {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ erro: 'Erro ao salvar relatório' }),
        };
      }
    }

    // DELETE — Remove um relatório por ID
    if (method === 'DELETE') {
      const { id } = body;
      const dados = lerRelatorios();

      const indice = dados.relatorios.findIndex((r) => r.id === id);
      if (indice === -1) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ erro: 'Relatório não encontrado' }),
        };
      }

      dados.relatorios.splice(indice, 1);
      dados.ultimaAtualizacao = new Date().toISOString();

      if (salvarRelatorios(dados)) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ sucesso: true }),
        };
      } else {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ erro: 'Erro ao deletar relatório' }),
        };
      }
    }

    // OPTIONS — Preflight CORS
    if (method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: '',
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ erro: 'Método não permitido' }),
    };
  } catch (erro) {
    console.error('Erro na API:', erro);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ erro: 'Erro interno do servidor', detalhes: erro.message }),
    };
  }
};
