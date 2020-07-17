const express = require('express')
const app = express()
const fs =require('fs')
const bodyParser = require('body-parser')
const mysql = require('mysql')
const jwt = require('jsonwebtoken')
const compression = require('compression')
const connectionPool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password : 'SU20000922',
  database : 'blog'
});
const secret = 'I Love code'
app.use(compression())
app.use(express.static('./dist',{
  maxage:'2h'
}))
app.use('/articleImg',express.static('articleImg'))
app.use(bodyParser.json({limit : '2100000kb'}));  
app.use(bodyParser.urlencoded({ extended: false }));

app.all('*', function (req, res, next) {
  //res.setHeader('Cache-Control','public,max-age=6')
  res.header("Access-Control-Allow-Origin", "*");
  res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
  res.header("Access-Control-Allow-Headers", ['X-Requested-With','Content-Type','Authorization']);
  next();
});
//数据库操作封装
// let query = function( sql, values ) {
//   // 返回一个 Promise
//   return new Promise(( resolve,reject ) => {
//     connectionPool.getConnection(function(err, connection) {
//       if (err) {
//         console.log(err)
//         reject('连接数据库连接池失败')
//       } else {
//         connection.query(sql, values, ( err, rows) => {
//           if ( err ) {
//             console.log(err)
//             reject('执行sql失败')
//           } else {
//             resolve( rows )
//           }
//           // 结束会话
//           connection.release()
//         })
//       }
//     })
//   })
// }
//数据库操作封装
const getConnection = function() {
  // 返回一个 Promise
  return new Promise(( resolve,reject ) => {
    connectionPool.getConnection(function(err, connection) {
      if (err) {
        reject('连接数据库连接池失败')
      } else {
        resolve(connection)
      }
    })
  })
}
const beginTransaction = (conn)=>{
  return new Promise((resolve,reject)=>{
    conn.beginTransaction((err)=>{
      if(err){
        reject('开启事务失败')
      }
      resolve()
    })
  })
}
const query = function (conn,sql,values ){
  return new Promise((resolve,reject)=>{
    conn.query(sql, values, ( err, rows) => {
      if ( err ) {
        console.log(err);
        reject('执行sql失败')
      } else {
        resolve( rows )
      }
      // 结束会话
    })
  })
}
const commit = (conn) => {
  return new Promise((resolve,reject)=>{
    conn.commit(err=>{
      if(err){
        conn.rollback()
        reject('事务提交失败')
      }
      resolve()
    })
  })
}
//读取文件
let fileRead = (path) => {
  return new Promise((resolve, reject) => {
    fs.readFile(path,(err,data) => {
      if (err) {
        console.log(err);
        reject('读取文件失败')
      }else {
        resolve(data)
      }
    })
  })
}
//封装token验证
let tokenTest = (token, secret) => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, secret, (err, decode) => {
      if (err) {
        reject(err)
      } else {
        resolve(decode)
      }
    })
  })
}
//封装文件写
const fileWrite = (path,buffer) => {
  return new Promise((resolve,reject) => {
    fs.writeFile(path,buffer,(err)=>{
      if(err){
        reject(err)
      }
    })
    resolve()
  })
}
//生成唯一标识码
function getUuid() {
	var s = [];
	var hexDigits = "0123456789abcdef";
	for (var i = 0; i < 36; i++) {
		s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
	}
	s[14] = "4"; // bits 12-15 of the time_hi_and_version field to 0010
	s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1); // bits 6-7 of the clock_seq_hi_and_reserved to 01
	s[8] = s[13] = s[18] = s[23] = "-";

	var uuid = s.join("");
	return uuid;
}
//用户登录
app.post('/user', (req, res) => {
  try{
    let payload = { name:'Ther的博客' }
    if (req.body.username === 'Ther' && req.body.password === 'SU20000922') {
      let token = jwt.sign(payload, secret)
      res.json({token:token})
    } else {
      res.status(403)
      res.json({message:'用户名或密码错误'})
    }
  }catch(err){
    res.status(500)
    res.json({message:'服务器错误'})
  }finally {
    if(conn){
      conn.release()
    }
  }
})
//添加博文
app.post('/edit',async (req, res) => {
  var conn = await getConnection()
  await beginTransaction(conn)
  let sql = 'INSERT INTO article(title,summary,time,type) VALUES(?,?,?,?)'
  let sqlParam = [req.body.title,req.body.summary,req.body.time,req.body.type]
  try {
    let rows = await query(conn,sql,sqlParam)
    let id = rows.insertId
    let img = (req.body.img).replace(/^data:image\/\w+;base64,/, "")
    let imgBuffer = Buffer.from(img, 'base64')
    await fileWrite('./summaryImg/'+id+'.jpg',imgBuffer)
    await fileWrite(`./article/${id}.html`,req.body.content)
    await commit(conn)
    res.status(200)
    res.json({message:'添加博文成功'})
  } catch(err){
    conn.rollback()
    console.log(err)
    res.status(500)
    res.json({message:'添加博文失败'})
  }finally {
    if(conn){
      conn.release()
    }
  }
})
//获取各博文列表
app.get('/catalogList',async (req, res) => {
  let sql = 'SELECT * FROM article'
  try {
    // let tokenResult = await tokenTest(req.headers.authorization, secret)
    // if (tokenResult.name !== 'Ther的博客') {
    //   res.status(403)
    //   res.end()
    // }
    var conn=await getConnection()
    let rows = await query(conn,sql)
    for(let j = 0;j<rows.length;j++) {
      let imgData = await fileRead(`./summaryImg/${rows[j].id}.jpg`)
      let buffer = Buffer.from(imgData,'binary')
      rows[j].img = `data:image/jpeg;base64,${buffer.toString('base64')}`
    }
    res.json(rows)
  } catch (err) {
    console.log(err)
    res.status(500)
    res.json({message:'服务器错误'})
  } finally {
    if(conn){
      conn.release()
    }
  }
})
//修改博文
app.put('/article/:id', async (req, res) => {
  try {
    let tokenResult = await tokenTest(req.headers.authorization, secret)
    if (tokenResult !== 'Ther的博客') {
      res.status(401)
      res.json({message:'未授权'})
    }
  }catch(err){
    res.status(401)
    res.json({message:'未授权'})
  }
  try {
    var conn=await getConnection()
    await beginTransaction(conn)
    let sql = 'UPDATE article SET title = ?,time = ?,summary = ?,type = ? WHERE id = ?'
    let sqlParam = [req.body.title, req.body.time, req.body.summary, req.body.type, req.params.id]
    let rows = await query(conn,sql, sqlParam)
    let img = (req.body.img).replace(/^data:image\/\w+;base64,/, "")
    let imgBuffer = Buffer.from(img, 'base64')
    await fileWrite('./summaryImg/'+req.params.id+'.jpg',imgBuffer)
    await fileWrite(`./article/${req.params.id}.html`,req.body.content)
    await commit(conn);
    res.send()
  } catch (err) {
    console.log(err)
    res.status(500)
    res.json({message:'服务器错误'})
  }finally {
    if(conn){
      conn.release()
    }
  }
})
//获取博文详细内容
app.get('/article/:id', async (req, res) => {
  try {
    var conn = await getConnection()
    let sql = 'SELECT * FROM article WHERE id = ?'
    let rows = await query(conn,sql, req.params.id)
    let textData = await fileRead(`./article/${req.params.id}.html`)
    rows[0].content = textData.toString('utf-8')
    res.json(rows[0])
  } catch (err) {
    console.log(err)
    res.status(500)
    res.json({message:'服务器错误'})
  }finally {
    if(conn){
      conn.release()
    }
  }
})
//获取修改博文
app.get('/modifyarticle/:id', async (req, res) => {
  try {
    var conn = await getConnection()
    let sql = 'SELECT * FROM article WHERE id = ?'
    let rows = await query(conn,sql, req.params.id)
    let textData = await fileRead(`./article/${req.params.id}.html`)
    rows[0].content = textData.toString('utf-8')
    let imgData = await fileRead(`./summaryImg/${rows[0].id}.jpg`)
    let buffer = Buffer.from(imgData,'binary')
    rows[0].img = `data:image/jpeg;base64,${buffer.toString('base64')}`
    console.log(rows[0])
    res.json(rows[0])
  } catch (err) {
    console.log(err)
    res.status(500)
    res.json({message:'服务器错误'})
  }finally {
    if(conn){
      conn.release()
    }
  }
})
//删除博文
app.delete('/article/:id', async (req, res) => {
  try {
    var conn = await getConnection()
    let sql = 'DELETE FROM article WHERE id = ?'
    let rows = await query(conn,sql, req.params.id)
    res.json({message:'删除博文成功'})
  } catch (err) {
    console.log(err)
    res.status(500)
    res.json({message:'服务器错误'})
  }finally {
    if(conn){
      conn.release()
    }
  }
})
//发表评论
app.post('/comment', async (req, res) => {
  try {
    var conn = await getConnection()
    await beginTransaction(conn)
    let insertSql = 'INSERT INTO comment(name, time, content,aid) VALUES(?,?,?,?)'
    let sqlParam = [req.body.name,req.body.time,req.body.content,req.body.aid]
    let rows = await query(conn,insertSql,sqlParam)
    let updateSql = 'UPDATE article SET comment = comment + 1 WHERE id = ?'
    await query(conn,updateSql,req.body.aid)
    await commit(conn)
    res.json({id:rows.insertId})
  } catch (err) {
    console.log(err)
    res.status(500)
    res.json({message:'服务器错误'})
  }finally {
    if(conn){
      conn.release()
    }
  }
})
//回复评论
app.post('/reply', async (req, res) => {
  try {
    var conn = await getConnection()
    await beginTransaction(conn)
    let insertSql = 'INSERT INTO reply(responder,reviewer, time, content,rid) VALUES(?,?,?,?,?)'
    let sqlParam = [req.body.responder,req.body.reviewer,req.body.time,req.body.content,req.body.rid]
    let rows = await query(conn,insertSql,sqlParam)
    let updateSql = 'UPDATE article SET comment = comment + 1 WHERE id = ?'
    await query(conn,updateSql,req.body.aid)
    await commit(conn)
    res.json({id:rows.insertId})
  } catch (err) {
    console.log(err)
    res.status(500)
    res.json({message:'服务器错误'})
  }finally {
    if(conn){
      conn.release()
    }
  }
})
//获取评论
app.get('/comment/:id', async (req, res) => {
  try {
    var conn = await getConnection()
    let sql_1 = 'SELECT * FROM comment WHERE aid = ?'
    let rows_1 = await query(conn,sql_1,req.params.id)
    console.log(rows_1);
    for(let j=0;j<rows_1.length;j++) {
      let selectSql = 'SELECT * FROM reply WHERE rid = ?' 
      let rows_2 = await query(conn,selectSql,rows_1[j].id)
      if(!rows_2) break
      rows_1[j].apply=rows_2
    }
    res.json(rows_1)
  } catch (err) {
    console.log(err)
    res.status(500)
    res.json({message:'服务器错误'})
  }finally {
    if(conn){
      conn.release()
    }
  }
})
//获取分类列表
app.get('/sort/:type', async (req, res) => {
  try {
    var conn = await getConnection()
    let sql = 'SELECT * FROM article WHERE type = ?'
    let rows = await query(conn,sql,req.params.type)
    for(let j = 0;j<rows.length;j++) {
      let imgData = await fileRead(`./summaryImg/${rows[j].id}.jpg`)
      let buffer = Buffer.from(imgData,'binary')
      rows[j].img = `data:image/jpeg;base64,${buffer.toString('base64')}`
    }
    res.json(rows)
  } catch (err) {
    console.log(err)
    res.status(500)
    res.json({message:'服务器错误'})
  }finally {
    if(conn){
      conn.release()
    }
  }
})
//上传博文中图片
app.post('/article/img',async (req,res)=>{
  try {
    let img = (req.body.img).replace(/^data:image\/\w+;base64,/, "")
    let imgBuffer = Buffer.from(img, 'base64');
    let id=getUuid()
    await fileWrite('./articleImg/'+id+'.jpg',imgBuffer)
    res.json({
      url:'http://localhost:8081/articleImg/'+id+'.jpg'
    })
  }catch(err){
    console.log(err);
    res.status(500)
    res.json({message:'服务器错误'})
  }finally {
    if(conn){
      conn.release()
    }
  }
})
app.listen(8081, () => {
  console.log('running...')
})
