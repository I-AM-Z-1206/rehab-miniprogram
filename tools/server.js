// server.js —— 康复数据邮件转发服务（部署在 ECS 47.112.18.198 上）
// 启动：npm i express nodemailer cors && node server.js
// 接口：POST http://47.112.18.198:3000/sendmail
//       请求体 { to: '收件邮箱', subject: '标题', data: { 训练数据 } }

const express = require('express')
const nodemailer = require('nodemailer')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

// ===== 邮箱配置 =====
const SMTP_USER = '1298834245@qq.com' // 发件邮箱
const SMTP_PASS = 'eqzxgwlbelgkbaai'  // QQ 邮箱 SMTP 授权码（不是登录密码）

const transporter = nodemailer.createTransport({
  host: 'smtp.qq.com',
  port: 465,
  secure: true,
  auth: { user: SMTP_USER, pass: SMTP_PASS }
})

// 健康检查：浏览器访问 http://47.112.18.198:3000/ 应返回 {"success":true,...}
app.get('/', (req, res) => res.json({ success: true, msg: '服务正常' }))

// 发送邮件
app.post('/sendmail', async (req, res) => {
  const data = req.body
  if (!data.to) return res.json({ success: false, msg: '缺少收件邮箱' })

  const mailOptions = {
    from: '"康复训练助手" <' + SMTP_USER + '>', // 必须与登录邮箱一致，否则 QQ 邮箱拒发
    to: data.to,
    subject: data.subject || '康复训练数据报告',
    text: JSON.stringify(data.data || {}, null, 2)
  }

  try {
    await transporter.sendMail(mailOptions)
    console.log('邮件已发送 -> ' + data.to)
    res.json({ success: true, msg: '邮件发送成功' })
  } catch (err) {
    console.error(err)
    res.json({ success: false, msg: '邮件发送失败', error: err.message })
  }
})

const port = 3000
app.listen(port, () => console.log('服务启动，端口 ' + port))
