var express = require('express');
var router = express.Router();
var request = require('request');
var xml2js = require('xml2js');
var parser = new xml2js.Parser();
var mysql = require('mysql');
// var mongoose = require('mongoose');
// var connection = mysql.createConnection({
//   host : 'localhost',
//   user : 'me',
//   password : '',
//   database : 'sktLolock'
// });
// =======
var mysql = require('mysql-promise')();
var mysqlConfig = require('../config/db_config.json');
mysql.configure(mysqlConfig);

/* GET home page. */
router.get('/', function(req, res, next) {
    console.log("HI");
    res.send();
});

/* GET ukey in xml / uKey를 xml 형식으로 받아서 리턴*/
router.get('/userids/:user_id/passwords/:passwd', function(req, res, next){
  var headers = {
    'user_id' : req.params.user_id,
    'password' : req.params.passwd
  }
  var options = {
    url : 'http://onem2m.sktiot.com:9000/ThingPlug?division=user&function=login',
    method : 'PUT',
    headers : headers
  }
  request(options, function(error, response, body){
    if(!error && response.statusCode == 200){
      parser.parseString(body, function(err, result) {
        // result를 JSON 형식으로 log
        /*
        {"ThingPlug":{"result_code":["200"],"result_msg":[""],"user":[{"admin_yn":["N"],"password":[""],"user_id":["nowniz93"],"uKey":["bjBwOXpCTUdxUFZ3UEZFR3lZTUZOeDlzdVl1OWpRdUdxTVg0Zmo5UHBIdFJOa2FObUJOTVNsamt1K00yYWRPTA=="]}]}}
        */
        console.log(JSON.stringify(result));
        // [ '200' ]
        console.log(result.ThingPlug.result_code);
        //[ 'bjBwOXpCTUdxUFZ3UEZFR3lZTUZOeDlzdVl1OWpRdUdxTVg0Zmo5UHBIdFJOa2FObUJOTVNsamt1K00yYWRPTA==' ]
        console.log(result.ThingPlug.user[0].uKey);
      });
    }
      // 이대로 보내면 웹브라우져에선 text밖에 보이지 않음(구분되지 않고 문자만 나옴)
      res.send(body);
   });
})


/* GET housemate list and response to app */
router.get('/homemateslist', function(req, res, next){
  console.log(JSON.stringify(req.headers.ltid)); // "Headers 의 LTID 키를 가져옴"

  // TODO : req.headers.ltid와 같은 아이디를 가지는 사용자를 db에서 찾아서 문자열로 가져옴
  var homematelist = {
    "mates": [
		{
			"mateImageUrl": "유저이미지url",
			"mateName": "동거인 네임",
			"mateOutingFlag": "동거인 나갔는지 들어왔는지 알려주는지 여부",
			"mateDoorOpenTime": "동거인 마지막으로 문 연 시간."
		},
		{
			"mateImageUrl": "유저이미지url",
			"mateName": "동거인 네임",
			"mateOutingFlag": "동거인 나갔는지 들어왔는지 알려주는지 여부",
			"mateDoorOpenTime": "동거인 마지막으로 문 연 시간."
		}
	],
	"mateNumber": 2
  }
  // TODO : 요청한 앱에 동거인 리스트를 body로 실어서 보냄

  res.send(homematelist);
})

/* POST User Info, LoRa ID, bluetooth address and GPS / 기기등록 */
// TODO : npm body-parser install, which data format will be used? and save mysql
router.post('/usernames/:username/loraid/bluetoothid/gps', function(req, res, next){

})

/* PUT Lolock to open / 로락을 원격으로 열 수 있도록 데이터 전송 */
router.put('/remotetest', function(req, res, next){
  console.log(1);
  // X-M2M-RI , X-M2M-Origin, uKey, Content-Type는 사용자마다 달라야한다. / 지금은 테스트 중이라 직접 입력함
  var headers = {
    'Accept' : 'application/xml',
    'X-M2M-RI' : '00000174d02544fffef0100d_0012', // LoLock_1 / LoLock_2 : 00000174d02544fffef0100d
    'X-M2M-Origin' : '00000174d02544fffef0100d',
    'uKey' : 'STRqQWE5a28zTlJ0QWQ0d0JyZVlBL1lWTkxCOFlTYm4raE5uSXJKTC95eG9NeUxoS3d4ejY2RWVIYStlQkhNSA==',
    'Content-Type' : 'application/xml'
  }

/*
  body(xml형식) 양식
  var body = '<?xml version="1.0" encoding="utf-8"?>' +
           '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">'+
            '<soap12:Body>......</soap12:Body></soap12:Envelope>';
  */
  var options = {  // 0240771000000174 : AppEUI 와 LTID 는 사용자마다 달라야한다. HOW? / 지금은 테스트라서 직접 입력헀다
    url : 'https://thingplugpf.sktiot.com:9443/0240771000000174/v1_0/mgmtCmd-00000174d02544fffef0100d_extDevMgmt',
    method : 'PUT',
    headers : headers,
    body : "<?xml version=\"1.0\" encoding=\"UTF-8\"?><m2m:mgc xmlns:m2m=\"http://www.onem2m.org/xml/protocols\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"><exe>true</exe><exra>010203</exra></m2m:mgc>"
  }

  request(options, function(error, response, body){
    if(!error && response.statusCode == 200){
      parser.parseString(body, function(err, result) {
        console.log(JSON.stringify(result));
        //console.log(result.ThingPlug.result_code);
        //console.log(result.ThingPlug.user[0].uKey);
      });
      res.send(body);
    }
  })
})

/* POST loRa subscribe한 데이터 전달받는다.*/
router.post('/loradata', function(req, res, next){
  parser.parseString(req.body, function(err, result) {
    console.log(JSON.stringify(result));
    console.log(result);
    //console.log(JSON.stringify(result.nev.rep));

  });
});


router.post('/register', function(req, res, next) {
    var jsonRes = req.body;
    var deviceId = jsonRes.registerDeviceId;
    var userName = jsonRes.registerUserName;
    var userPhoneId = jsonRes.registerUserPhoneId;
    var userBluetoothId = jsonRes.registerUserBluetoothId;
    var userGPS = jsonRes.registerUserGPS;
    var getDeviceIdFromDB;
    var getUserIdFromDB;
    console.log(deviceId);
    console.log(userName);
    mysql.query("SELECT id FROM lolock_devices WHERE device_id=?", [deviceId])
        .spread(function(rows) {
            if (rows[0] == null) {
                res.json({
                    code: 'DEVICE_ID_ERR',
                    message: '등록되지 않은 기기'
                });
            } else {
                getDeviceIdFromDB = rows[0].id;
                return mysql.query("INSERT INTO lolock_users (name,phone_id,bluetooth_id,gps) VALUES (?,?,?,?)", [userName, userPhoneId, userBluetoothId, userGPS]);
            }
        }).then(function() {
          console.log(userPhoneId);
            return mysql.query("SELECT id FROM lolock_users WHERE phone_id=?", [userPhoneId]);
        })
        .spread(function(rows) {
            getUserIdFromDB = rows[0].id;
            console.log(getUserIdFromDB);
            return mysql.query("INSERT INTO lolock_register (user_id,device_id) VALUES (?,?)", [getUserIdFromDB, getDeviceIdFromDB]);
        })
        .then(function() {
            res.status(201);
            res.json({
                code: 'SUCCESS',
                message: '작성 성공'
            });
        })
        .catch(function(err) {
            console.log(err);
            res.status(500);
            res.json({
                code: 'DB_ERR',
                message: '데이터베이스 에러'
            });
        });
});
module.exports = router;
