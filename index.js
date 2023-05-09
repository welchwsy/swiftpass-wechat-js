const _ = require('underscore');
const xml2js = require('xml2js');
const crypto = require('crypto');
const axios = require('axios');

const RETURN_CODES = {
  SUCCESS: 'SUCCESS',
  FAIL: 'FAIL'
};

const URL = "https://pay.swiftpass.cn/pay/gateway";

const URLS = {
  UNIFIED_ORDER: 'pay.weixin.native',
  JS_PAY: 'pay.weixin.jspay',
  ORDER_QUERY: 'unified.trade.query',
  REFUND: 'unified.trade.refund',
  REFUND_QUERY: 'unified.trade.refundquery',
  CLOSE_ORDER: 'unified.trade.close'
};

/**
 * 构造函数
 * @param {Object} config 配置
 * mchId 商户号
 * privateKey 私钥String
 * publicKey 公钥String
 */
// const Swiftpass = function(config) {
//   this.subAppId = config.subAppId;
//   this.partnerKey = config.partnerKey;
//   this.mchId = config.mchId;
//   this.notifyUrl = config.notifyUrl;
//   this.passphrase = config.passphrase || config.mchId;
//   this.pfx = config.pfx;
//   this.privateKey = config.privateKey
//   this.publicKey = config.publicKey
//   this.signType = config.signType || 'RSA_1_256'
//   return this;
// };

class Swiftpass {
  constructor(config) {
      this.subAppId = config.subAppId;
      this.partnerKey = config.partnerKey;
      this.mchId = config.mchId;
      this.notifyUrl = config.notifyUrl;
      this.passphrase = config.passphrase || config.mchId;
      this.pfx = config.pfx;
      this.privateKey = config.privateKey
      this.publicKey = config.publicKey
      this.signType = config.signType || 'RSA_1_256'
  }
}

Swiftpass.prototype.getBrandWCPayRequestParams = async function(order) {
  order = this._extendWithDefault(order, [
    'notify_url'
  ]);
  const data = await this.unifiedOrder(order);
  return JSON.parse(data.pay_info)
};

Swiftpass.prototype._signedQuery = async function(url, params, options) {
  const required = options.required || [];
  params['service'] = url;
  params = this._extendWithDefault(params, [
    'mch_id',
    'nonce_str',
    'sub_appid',
    'sign_type'
  ]);

  params = _.extend({
    'sign': this._getSign(params)
  }, params);

  if (params.long_url) {
    params.long_url = encodeURIComponent(params.long_url);
  }

  for (const key in params) {
    if (params[key] !== undefined && params[key] !== null) {
      params[key] = params[key].toString();
    }
  }

  const missing = [];
  required.forEach(function(key) {
    const alters = key.split('|');
    for (let i = alters.length - 1; i >= 0; i--) {
      if (params[alters[i]]) {
        return;
      }
    }
    missing.push(key);
  });

  if (missing.length) {
    throw new Error('missing params ' + missing.join(','));
  }
  const response = await axios.post(URL, this.buildXml(params))
  const data = await this.validate(response.data)
  return data
};

Swiftpass.prototype.unifiedOrder = async function(params) {
  const requiredData = ['body', 'out_trade_no', 'total_fee', 'mch_create_ip', 'mch_id', 'service']; //'sub_appid'
  params.notify_url = params.notify_url || this.notifyUrl;
  params.is_raw = params.is_raw || '1';
  return await this._signedQuery(params['service'] || URLS.JS_PAY, params, {
    required: requiredData
  });
};

Swiftpass.prototype.orderQuery = async function(params) {
  return await this._signedQuery(URLS.ORDER_QUERY, params, {
    required: ['transaction_id|out_trade_no']
  });
};

Swiftpass.prototype.refund = async function(params) {
  params = this._extendWithDefault(params, [
    'op_user_id'
  ]);

  return await this._signedQuery(URLS.REFUND, params, {
    https: true,
    required: ['transaction_id|out_trade_no', 'out_refund_no', 'total_fee', 'refund_fee']
  });
};

Swiftpass.prototype.refundQuery = async function(params) {
  return await this._signedQuery(URLS.REFUND_QUERY, params, {
    required: ['transaction_id|out_trade_no|out_refund_no|refund_id']
  });
};

Swiftpass.prototype.closeOrder = async function(params) {
  return await this._signedQuery(URLS.CLOSE_ORDER, params, {
    required: ['out_trade_no']
  });
};

Swiftpass.prototype.parseCsv = function(text) {
  const rows = text.trim().split(/\r?\n/);

  function toArr(rows) {
    const titles = rows[0].split(',');
    const bodys = rows.splice(1);
    const data = [];

    bodys.forEach(function(row) {
      const rowData = {};
      row.split(',').forEach(function(cell, i) {
        rowData[titles[i]] = cell.split('`')[1];
      });
      data.push(rowData);
    });
    return data;
  }

  return {
    list: toArr(rows.slice(0, rows.length - 2)),
    stat: toArr(rows.slice(rows.length - 2, rows.length))[0]
  };
};

Swiftpass.prototype.buildXml = function(obj) {
  const builder = new xml2js.Builder({
    allowSurrogateChars: true
  });
  const xml = builder.buildObject({
    xml: obj
  });
  return xml;
};

Swiftpass.prototype.validate = async function(xml) {
  const json = await xml2js.parseStringPromise(xml, {
    trim: true,
    explicitArray: false
  });
  const data = json ? json.xml : {};
  if (data.return_code == RETURN_CODES.FAIL) {
    error = new Error(data.return_msg);
    error.name = 'ProtocolError';
    throw error
  } else if (data.result_code == RETURN_CODES.FAIL) {
    error = new Error(data.err_code);
    error.name = 'BusinessError';
    throw error
  }
  if (!data.pay_info) {
    error = new Error('请传入支付方式');
    error.name = 'missParamError';
    throw error
  }
  return data
};

/**
 * 使用默认值扩展对象
 * @param  {Object} obj
 * @param  {Array} keysNeedExtend
 * @return {Object} extendedObject
 */
Swiftpass.prototype._extendWithDefault = function(obj, keysNeedExtend) {
  const defaults = {
    sub_appid: this.subAppId,
    mch_id: this.mchId,
    sub_mch_id: this.subMchId,
    nonce_str: this._generateNonceStr(),
    notify_url: this.notifyUrl,
    op_user_id: this.mchId,
    sign_type: this.signType,
    pfx: this.pfx
  };
  const extendObject = {};
  keysNeedExtend.forEach(function(k) {
    if (defaults[k]) {
      extendObject[k] = defaults[k];
    }
  });
  return _.extend(extendObject, obj);
};

Swiftpass.prototype._getSign = function(pkg, signType = 'RSA_1_256', key = null) {
  pkg = _.clone(pkg);
  delete pkg.sign;
  const string1 = this._toQueryString(pkg);
  const signTypes = {
    RSA_1_256: 'RSA-SHA256',
    RSA_1_1: 'RSA-SHA1'
  }
  const signValue = crypto.createSign(signTypes[signType]).update(string1, 'utf-8').sign(key || this.privateKey, 'base64')
  return signValue;
};

Swiftpass.prototype._toQueryString = function(object) {
  return Object.keys(object).filter(function(key) {
    return object[key] !== undefined && object[key] !== '';
  }).sort().map(function(key) {
    return key + '=' + object[key];
  }).join('&');
};

Swiftpass.prototype._generateTimeStamp = function() {
  return parseInt(+new Date() / 1000, 10) + '';
};

/**
 * [_generateNonceStr description]
 * @param  {[type]} length [description]
 * @return {[type]}        [description]
 */
Swiftpass.prototype._generateNonceStr = function(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const maxPos = chars.length;
  let nonceStr = '';
  for (let i = 0; i < (length || 32); i++) {
    nonceStr += chars.charAt(Math.floor(Math.random() * maxPos));
  }
  return nonceStr;
};
/**
 * 支付成功的消息回调解析
 * @param {string} xml 回调消息的xml格式body
 * @returns 
 */
Swiftpass.prototype.notify = async function (xml) {
  const json = await xml2js.parseStringPromise(xml, {
    trim: true,
    explicitArray: false
  })
  // 验证签名
  if (json.xml.sign_type === 'RSA_1_1' || json.xml.sign_type === 'RSA_1_256') {
    const pkg = _.clone(json.xml)
    delete pkg.sign
    const string1 = this._toQueryString(pkg);
    const sign = json.xml.sign
    var verify = crypto.createVerify('RSA-SHA256').update(string1).verify(this.publicKey, sign, 'base64');
    if (verify) {
      return json.xml
    } else {
      throw new Error('签名验证失败')
    }
  } else {
    // 签名 sign_type 错误
    throw new Error('签名错误')
  }
}
module.exports = Swiftpass;
