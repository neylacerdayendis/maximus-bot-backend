"""CANDLE SERVICE - Maximus Bot
-----------------------------
Microservico em Python responsavel por:
  1) Conectar na IQ Option usando a biblioteca nao-oficial `iqoptionapi`
  2) Buscar candles (velas) em tempo real e historico
  3) Expor tudo via HTTP simples, pra o backend Node consumir

COMO INSTALAR (rodar no seu computador/servidor, que tem internet):
  pip install -U git+https://github.com/iqoptionapi/iqoptionapi.git
  pip install flask flask-cors python-dotenv

COMO CONFIGURAR:
  Crie um arquivo .env nesta mesma pasta com:
    IQ_EMAIL=seu_email_aqui
    IQ_PASSWORD=sua_senha_aqui
    IQ_ACCOUNT_TYPE=PRACTICE   # ou REAL (recomendo comecar com PRACTICE/demo)
    PORT=5001

COMO RODAR:
  python candle_service.py

ENDPOINTS:
  GET /health
      -> checa se o servico esta de pe e conectado na IQ Option

  GET /candles?pair=EURUSD&timeframe=60&count=100
      -> retorna os ultimos `count` candles do par, no timeframe em segundos
         (60=M1, 300=M5, 900=M15)

  GET /candles/stream?pair=EURUSD&timeframe=60
      -> (versao simples) retorna o candle mais recente (em formacao ou
         ultimo fechado) - o backend Node pode dar polling nesse endpoint
         a cada poucos segundos para simular tempo real

NOTA SOBRE CONTAS (PRACTICE/REAL):
  O endpoint POST /order/buy aceita o campo "account_type" no body
  ("PRACTICE" ou "REAL"). Se enviado, o servico troca a conta da IQ Option
  antes de comprar. Isso permite operar no demo OU no real a partir do painel.
  Por seguranca, operacoes na conta REAL so sao permitidas se a variavel
  ALLOW_REAL_TRADING=true estiver no .env.
"""

import os
import time
import logging
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("candle_service")

# --- Configuracao ---
IQ_EMAIL = os.getenv("IQ_EMAIL")
IQ_PASSWORD = os.getenv("IQ_PASSWORD")
IQ_ACCOUNT_TYPE = os.getenv("IQ_ACCOUNT_TYPE", "PRACTICE")  # PRACTICE (demo) ou REAL
PORT = int(os.getenv("PORT", "5001"))

app = Flask(__name__)
CORS(app)

# Conexao global com a IQ Option (inicializada em connect_iq())
iq_client = None


def connect_iq():
    """Conecta (ou reconecta) na IQ Option. Retorna o cliente conectado."""
    global iq_client

    if not IQ_EMAIL or not IQ_PASSWORD:
        raise RuntimeError(
            "IQ_EMAIL e IQ_PASSWORD precisam estar definidos no arquivo .env"
        )

    # Import feito aqui dentro para dar uma mensagem de erro clara
    # caso a biblioteca nao esteja instalada ainda.
    try:
        from iqoptionapi.stable_api import IQ_Option
    except ImportError as exc:
        raise RuntimeError(
            "Biblioteca iqoptionapi nao encontrada. Instale com:\n"
            "  pip install -U git+https://github.com/iqoptionapi/iqoptionapi.git"
        ) from exc

    logger.info("Conectando na IQ Option (%s)...", IQ_ACCOUNT_TYPE)
    client = IQ_Option(IQ_EMAIL, IQ_PASSWORD)
    check, reason = client.connect()

    if not check:
        raise RuntimeError(f"Falha ao conectar na IQ Option: {reason}")

    client.change_balance(IQ_ACCOUNT_TYPE)  # troca para conta demo ou real
    logger.info("Conectado com sucesso na IQ Option.")

    iq_client = client
    return client


def ensure_connected():
    """Garante que existe uma conexao ativa, reconectando se necessario."""
    global iq_client

    if iq_client is None:
        return connect_iq()

    try:
        if not iq_client.check_connect():
            logger.warning("Conexao caiu, reconectando...")
            return connect_iq()
    except Exception:
        logger.warning("Erro ao checar conexao, reconectando...")
        return connect_iq()

    return iq_client


def switch_account(account_type=None):
    """Troca a conta da IQ Option para a desejada (PRACTICE ou REAL).

    Recebe o account_type do request e, se for diferente do que esta em uso,
    chama change_balance() para alternar entre demo e real. Retorna o cliente
    ja na conta correta e o nome da conta ativa.
    """
    global iq_client, IQ_ACCOUNT_TYPE

    target = (account_type or IQ_ACCOUNT_TYPE).upper()
    if target not in ("PRACTICE", "REAL"):
        target = IQ_ACCOUNT_TYPE.upper()

    # A conexao precisa estar ativa de qualquer forma (a troca so ocorre
    # quando necessario, para nao ficar chamando change_balance a toa)
    client = ensure_connected()

    if target != IQ_ACCOUNT_TYPE:
        client.change_balance(target)
        IQ_ACCOUNT_TYPE = target
        logger.info("Conta IQ trocada para %s", target)

    return client, target


def format_candle(raw):
    """Converte o formato de candle da iqoptionapi para o formato usado
    pelo modulo combo1-comandos.js no backend Node.
    """
    return {
        "time": raw.get("from") or raw.get("id"),
        "open": raw.get("open"),
        "high": raw.get("max"),
        "low": raw.get("min"),
        "close": raw.get("close"),
    }


@app.route("/health", methods=["GET"])
def health():
    try:
        client = ensure_connected()
        connected = client.check_connect()
    except Exception as exc:
        return jsonify({"status": "error", "detail": str(exc)}), 500

    return jsonify({"status": "ok", "connected": connected, "account": IQ_ACCOUNT_TYPE})


@app.route("/candles", methods=["GET"])
def get_candles():
    """
    Query params:
      pair       - ex: EURUSD (obrigatorio)
      timeframe  - segundos: 60 (M1), 300 (M5), 900 (M15) - default 60
      count      - quantidade de candles - default 100, max 1000
    """
    pair = request.args.get("pair")
    timeframe = int(request.args.get("timeframe", 60))
    count = min(int(request.args.get("count", 100)), 1000)

    if not pair:
        return jsonify({"error": "parametro 'pair' e obrigatorio, ex: ?pair=EURUSD"}), 400

    try:
        client = ensure_connected()
        raw_candles = client.get_candles(pair, timeframe, count, time.time())
        candles = [format_candle(c) for c in raw_candles]
        return jsonify({"pair": pair, "timeframe": timeframe, "candles": candles})
    except Exception as exc:
        logger.exception("Erro ao buscar candles")
        return jsonify({"error": str(exc)}), 500


@app.route("/order/buy", methods=["POST"])
def place_order():
    """
    Abre uma ordem de compra (call) ou venda (put) na IQ Option.

    Body JSON esperado:
      {
        "pair": "EURUSD",
        "direction": "call" | "put",   # call = compra, put = venda
        "amount": 5,                    # valor da entrada em dinheiro
        "expiration": 1,                # minutos de expiracao (1, 5, 15...)
        "account_type": "PRACTICE"      # opcional: PRACTICE (demo) ou REAL
      }

    O campo "account_type" permite escolher a conta na hora da ordem. Se a
    conta REAL for pedida, exige ALLOW_REAL_TRADING=true no .env (trava de
    seguranca para evitar operar com dinheiro real sem confirmacao).
    """
    data = request.get_json(force=True) or {}
    pair = data.get("pair")
    direction = data.get("direction")
    amount = data.get("amount")
    expiration = data.get("expiration", 1)

    # Conta escolhida no painel (PRACTICE ou REAL) - default: env
    account_type = (data.get("account_type") or IQ_ACCOUNT_TYPE).upper()
    if account_type not in ("PRACTICE", "REAL"):
        return jsonify({"error": "account_type deve ser PRACTICE ou REAL"}), 400

    if not pair or direction not in ("call", "put") or not amount:
        return jsonify({"error": "campos obrigatorios: pair, direction (call/put), amount"}), 400

    allow_real = os.getenv("ALLOW_REAL_TRADING", "false").lower() == "true"
    if account_type == "REAL" and not allow_real:
        return jsonify({
            "error": (
                "Bloqueado: a ordem pediu conta REAL e ALLOW_REAL_TRADING nao "
                "esta habilitado no .env. Isso e uma trava de seguranca proposital."
            )
        }), 403

    try:
        client, _ = switch_account(account_type)
        check, order_id = client.buy(amount, pair, direction, expiration)
        if not check:
            return jsonify({"error": f"Falha ao abrir ordem: {order_id}"}), 500

        logger.info("Ordem aberta: %s %s valor=%s exp=%smin id=%s conta=%s", pair, direction, amount, expiration, order_id, account_type)
        return jsonify({"order_id": order_id, "pair": pair, "direction": direction, "amount": amount, "account_type": account_type})
    except Exception as exc:
        logger.exception("Erro ao abrir ordem")
        return jsonify({"error": str(exc)}), 500


@app.route("/order/result", methods=["GET"])
def get_order_result():
    """
    Consulta o resultado de uma ordem ja expirada.
    Query params: order_id (obrigatorio)

    Retorna: { status: "pending" | "win" | "loss" | "draw", profit: number }
    """
    order_id = request.args.get("order_id")
    if not order_id:
        return jsonify({"error": "parametro order_id e obrigatorio"}), 400

    try:
        client = ensure_connected()
        # check_win_v4 bloqueia ate a ordem expirar e retorna o lucro/prejuizo
        result, profit = client.check_win_v4(int(order_id))

        if profit is None:
            status = "pending"
        elif profit > 0:
            status = "win"
        elif profit < 0:
            status = "loss"
        else:
            status = "draw"

        return jsonify({"order_id": order_id, "status": status, "profit": profit})
    except Exception as exc:
        logger.exception("Erro ao consultar resultado da ordem")
        return jsonify({"error": str(exc)}), 500


@app.route("/candles/latest", methods=["GET"])
def get_latest_candle():
    """Retorna somente o candle mais recente - util pra polling em tempo real."""
    pair = request.args.get("pair")
    timeframe = int(request.args.get("timeframe", 60))

    if not pair:
        return jsonify({"error": "parametro 'pair' e obrigatorio, ex: ?pair=EURUSD"}), 400

    try:
        client = ensure_connected()
        raw_candles = client.get_candles(pair, timeframe, 2, time.time())
        candle = format_candle(raw_candles[-1]) if raw_candles else None
        return jsonify({"pair": pair, "timeframe": timeframe, "candle": candle})
    except Exception as exc:
        logger.exception("Erro ao buscar candle mais recente")
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    try:
        connect_iq()
    except Exception as exc:
        logger.error("Nao foi possivel conectar na inicializacao: %s", exc)
        logger.error("O servico vai subir mesmo assim e tentar reconectar a cada request.")

    app.run(host="0.0.0.0", port=PORT, debug=False)
