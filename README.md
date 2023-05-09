# 威富通微信支付 for node.js

公众号&小程序支付

## 初始化

```js
const Swiftpass = require('swiftpass');
const config = {
  // subAppId: "",
  partnerKey: "<partnerkey>",
  // appId: "",
  mchId: "",
  notifyUrl: "",
  privateKey: "your private_ras_key",
  // 从读取私钥文件
  // privateKey: fs.readFileSync("./cert/private_rsa_key.pem").toString()
  publicKey: "your public_ras_key"
  // 从读取公钥文件
  // publicKey: fs.readFileSync("./cert/public_rsa_key.pem").toString()
};

const pay = new Swiftpass(config);
```

## 初始化请求API

```js

const pay = new Swiftpass(config);
const orderInfo = {
  out_trade_no: '7100429383960747',
  body: '测试购买商品',
  total_fee: '1',
  mch_create_ip: '110.85.162.211',
  sign_type: 'RSA_1_256',
  is_raw: '1',
}
// 初始化请求API
const result = await pay.unifiedOrder(orderInfo);
// unifiedOrder接口JSON.parse(pay_info) 可以直接传给前端
const payParams = await pay.getBrandWCPayRequestParams(orderInfo);

```

## JS支付通知API

```js
async notify(ctx) {
  const pay = new Swiftpass(config);
  // 验签并解析回调接口
  const data = await pay.notify(ctx.request.body);
  const payInfo = JSON.parse(data.pay_info)
  ctx.body = 'success';
}
```
