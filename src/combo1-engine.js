const CONFIG = {
  profundidadeBusca: 60,
  casasTaxa: 5,
  periodoMedia20: 20,
  periodoMedia200: 200,
  periodoExaustao: 14,
  fatorExaustao: 2.2,
  fatorRegiaoMais: 0.8,
  renovacaoExtremo: 5,
  minimoVelas: 260
};

const TIPO_NENHUM = 0;
const TIPO_ABERTURA = 1;
const TIPO_MAXIMA = 2;
const TIPO_MINIMA = 3;

function analyzeCandles(candles) {
  if (candles && !Array.isArray(candles) && Array.isArray(candles.candles)) {
    candles = candles.candles;
  }
  if (!Array.isArray(candles)) return null;
  const n = candles.length;
  if (n < CONFIG.minimoVelas) return null;

  const O = candles.map((c) => c.open);
  const H = candles.map((c) => c.high);
  const L = candles.map((c) => c.low);

  function at(arr, k) {
    return arr[n - 1 - k];
  }

  function smaArray(arr, period) {
    const out = new Array(arr.length);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
      if (i >= period) sum -= arr[i - period];
      out[i] = i >= period - 1 ? sum / period : NaN;
    }
    return out;
  }

  function highestBack(arr, k, period) {
    let m = -Infinity;
    for (let i = k; i <= k + period - 1; i++) {
      const v = at(arr, i);
      if (v > m) m = v;
    }
    return m;
  }

  function lowestBack(arr, k, period) {
    let m = Infinity;
    for (let i = k; i <= k + period - 1; i++) {
      const v = at(arr, i);
      if (v < m) m = v;
    }
    return m;
  }

  const fatorTaxa = Math.pow(10, CONFIG.casasTaxa);
  function mesmaTaxa(a, b) {
    return Math.round(a * fatorTaxa) === Math.round(b * fatorTaxa);
  }

  function tipoTaxaValidadaNaVela(i, nivel) {
    const ab = at(O, i);
    const fec = at(O, i - 1);
    const compra = fec > ab;
    const venda = fec < ab;
    if (mesmaTaxa(ab, nivel)) return TIPO_ABERTURA;
    if (compra) {
      if (at(L, i) < ab && mesmaTaxa(at(L, i), nivel)) return TIPO_MINIMA;
      if (at(H, i) > fec && mesmaTaxa(at(H, i), nivel)) return TIPO_MAXIMA;
    } else if (venda) {
      if (at(H, i) > ab && mesmaTaxa(at(H, i), nivel)) return TIPO_MAXIMA;
      if (at(L, i) < fec && mesmaTaxa(at(L, i), nivel)) return TIPO_MINIMA;
    } else {
      if (at(H, i) > ab && mesmaTaxa(at(H, i), nivel)) return TIPO_MAXIMA;
      if (at(L, i) < ab && mesmaTaxa(at(L, i), nivel)) return TIPO_MINIMA;
    }
    return TIPO_NENHUM;
  }

  function contarTaxaAntesDoPavioAtual(nivel) {
    let q = mesmaTaxa(at(O, 1), nivel) ? 1 : 0;
    for (let i = CONFIG.profundidadeBusca; i >= 2; i--) {
      if (tipoTaxaValidadaNaVela(i, nivel) !== TIPO_NENHUM) q++;
    }
    return q;
  }

  function contarTaxaAntesDoFechamentoAtual(nivel) {
    let q = tipoTaxaValidadaNaVela(1, nivel) !== TIPO_NENHUM ? 1 : 0;
    for (let i = CONFIG.profundidadeBusca; i >= 2; i--) {
      if (tipoTaxaValidadaNaVela(i, nivel) !== TIPO_NENHUM) q++;
    }
    return q;
  }

  function ultimaTaxaAntesDoPavioAtual(nivel) {
    if (mesmaTaxa(at(O, 1), nivel)) return { tipo: TIPO_ABERTURA, indice: 1 };
    for (let i = 2; i <= CONFIG.profundidadeBusca; i++) {
      const t = tipoTaxaValidadaNaVela(i, nivel);
      if (t !== TIPO_NENHUM) return { tipo: t, indice: i };
    }
    return { tipo: TIPO_NENHUM, indice: null };
  }

  function existeCorpoEntreSimetria(indiceOrigem, nivel) {
    if (!indiceOrigem || indiceOrigem <= 1) return false;
    for (let j = indiceOrigem - 1; j >= 1; j--) {
      const fechamentoVerdadeiro = j === 1 ? at(O, 0) : at(O, j - 1);
      const corpoMin = Math.min(at(O, j), fechamentoVerdadeiro);
      const corpoMax = Math.max(at(O, j), fechamentoVerdadeiro);
      if (corpoMin < nivel && corpoMax > nivel) return true;
    }
    return false;
  }

  const open = at(O, 0);
  const open1 = at(O, 1);
  const high1 = at(H, 1);
  const low1 = at(L, 1);

  const sma20 = smaArray(O, CONFIG.periodoMedia20);
  const sma200 = smaArray(O, CONFIG.periodoMedia200);
  const smaRng = smaArray(H.map((v, i) => v - L[i]), CONFIG.periodoExaustao);

  const m20 = at(sma20, 1);
  const m200 = at(sma200, 1);
  const m20Prev = at(sma20, 2);
  const m200Prev = at(sma200, 2);

  const precoAcimaDasDuas = open > m20 && open > m200;
  const precoAbaixoDasDuas = open < m20 && open < m200;
  const minM = Math.min(m20, m200);
  const maxM = Math.max(m20, m200);
  const precoEntreMedias = open >= minM && open <= maxM;
  const media20Sobe = m20 > m20Prev;
  const media20Desce = m20 < m20Prev;
  const media200Sobe = m200 >= m200Prev;
  const media200Desce = m200 <= m200Prev;
  const tendenciaAlta = precoAcimaDasDuas && m20 > m200 && media20Sobe && media200Sobe;
  const tendenciaBaixa = precoAbaixoDasDuas && m20 < m200 && media20Desce && media200Desce;
  const mercadoNeutro = precoEntreMedias || (!tendenciaAlta && !tendenciaBaixa);

  const escalaExaustao = at(smaRng, 1);
  const escalaExaustaoSegura = escalaExaustao > 0 ? escalaExaustao : 0.0000001;
  const distanciaExaustaoAlta = (high1 - m20) / escalaExaustaoSegura;
  const distanciaExaustaoBaixa = (m20 - low1) / escalaExaustaoSegura;
  const renovouMaxima = high1 >= highestBack(H, 2, CONFIG.renovacaoExtremo);
  const renovouMinima = low1 <= lowestBack(L, 2, CONFIG.renovacaoExtremo);
  const exaustaoAlta = tendenciaAlta && distanciaExaustaoAlta >= CONFIG.fatorExaustao && renovouMaxima;
  const exaustaoBaixa = tendenciaBaixa && distanciaExaustaoBaixa >= CONFIG.fatorExaustao && renovouMinima;
  const somenteVendaPorMinima = renovouMinima && !renovouMaxima;
  const somenteCompraPorMaxima = renovouMaxima && !renovouMinima;
  const autorizaCompraBase = mercadoNeutro || tendenciaAlta || exaustaoBaixa;
  const autorizaVendaBase = mercadoNeutro || tendenciaBaixa || exaustaoAlta;
  const autorizaCompra = somenteCompraPorMaxima || (!somenteVendaPorMinima && !somenteCompraPorMaxima && autorizaCompraBase);
  const autorizaVenda = somenteVendaPorMinima || (!somenteCompraPorMaxima && !somenteVendaPorMinima && autorizaVendaBase);

  const distanciaPrecoMa20Mais = Math.abs(open - m20) / escalaExaustaoSegura;
  const proximoMa20ParaMais = distanciaPrecoMa20Mais <= CONFIG.fatorRegiaoMais;
  const regiaoForcaCompraMais = m20 > m200 && open > m20 && open > m200 && proximoMa20ParaMais;
  const regiaoForcaVendaMais = m200 > m20 && open < m20 && open < m200 && proximoMa20ParaMais;
  const precoEntre20_200 = open >= minM && open <= maxM;
  const permiteCompraMais = !precoEntre20_200 && (regiaoForcaCompraMais || exaustaoBaixa);
  const permiteVendaMais = !precoEntre20_200 && (regiaoForcaVendaMais || exaustaoAlta);

  const fechamentoAtualValidado = open;
  const compraAtualValidada = fechamentoAtualValidado > open1;
  const vendaAtualValidada = fechamentoAtualValidado < open1;
  const pavioMaximaAtualValidado = compraAtualValidada && high1 > fechamentoAtualValidado;
  const pavioMinimaAtualValidado = vendaAtualValidada && low1 < fechamentoAtualValidado;

  const quantidadeAntesFechamento = contarTaxaAntesDoFechamentoAtual(fechamentoAtualValidado);
  const fechamentoCompletaPar = quantidadeAntesFechamento % 2 === 1;
  let vendaTravaFechamento = compraAtualValidada && fechamentoCompletaPar;
  let compraTravaFechamento = vendaAtualValidada && fechamentoCompletaPar;
  let vendaTravaPavio = false;
  let compraTravaPavio = false;
  let desinstalacaoMaxima = false;
  let desinstalacaoMinima = false;

  if (pavioMaximaAtualValidado) {
    const nivel = high1;
    const quantidadeAnterior = contarTaxaAntesDoPavioAtual(nivel);
    const ultima = ultimaTaxaAntesDoPavioAtual(nivel);
    if (quantidadeAnterior % 2 === 1) {
      if (ultima.tipo === TIPO_MAXIMA) {
        desinstalacaoMaxima = !existeCorpoEntreSimetria(ultima.indice, nivel);
      } else if (ultima.tipo !== TIPO_NENHUM) {
        vendaTravaPavio = true;
      }
    }
  }

  if (pavioMinimaAtualValidado) {
    const nivel = low1;
    const quantidadeAnterior = contarTaxaAntesDoPavioAtual(nivel);
    const ultima = ultimaTaxaAntesDoPavioAtual(nivel);
    if (quantidadeAnterior % 2 === 1) {
      if (ultima.tipo === TIPO_MINIMA) {
        desinstalacaoMinima = !existeCorpoEntreSimetria(ultima.indice, nivel);
      } else if (ultima.tipo !== TIPO_NENHUM) {
        compraTravaPavio = true;
      }
    }
  }

  const vela1Alta = compraAtualValidada;
  const vela1Baixa = vendaAtualValidada;
  const temLinhaVerde = pavioMaximaAtualValidado;
  const temLinhaVermelha = pavioMinimaAtualValidado;

  const vendaDuplo = vela1Alta && temLinhaVerde && vendaTravaPavio && vendaTravaFechamento;
  const compraDuplo = vela1Baixa && temLinhaVermelha && compraTravaPavio && compraTravaFechamento;
  const vendaAlgum = vela1Alta && (vendaTravaPavio || vendaTravaFechamento || desinstalacaoMaxima);
  const compraAlgum = vela1Baixa && (compraTravaPavio || compraTravaFechamento || desinstalacaoMinima);

  const sinalVendaMais = vendaDuplo && autorizaVenda && permiteVendaMais;
  const sinalCompraMais = compraDuplo && autorizaCompra && permiteCompraMais;
  const sinalVenda = vendaAlgum && autorizaVenda && !sinalVendaMais;
  const sinalCompra = compraAlgum && autorizaCompra && !sinalCompraMais;

  const cicloCompra = somenteCompraPorMaxima && !somenteVendaPorMinima;
  const cicloVenda = somenteVendaPorMinima && !somenteCompraPorMaxima;
  let continuacaoCompra = vela1Alta && renovouMaxima && tendenciaAlta && cicloCompra && autorizaCompra && !exaustaoAlta;
  let continuacaoVenda = vela1Baixa && renovouMinima && tendenciaBaixa && cicloVenda && autorizaVenda && !exaustaoBaixa;
  continuacaoCompra = continuacaoCompra && !sinalCompra && !sinalCompraMais;
  continuacaoVenda = continuacaoVenda && !sinalVenda && !sinalVendaMais;

  if (sinalVendaMais || sinalVenda || continuacaoVenda) return "put";
  if (sinalCompraMais || sinalCompra || continuacaoCompra) return "call";
  return null;
}

module.exports = { analyzeCandles };