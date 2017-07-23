var express = require('express');
var router = express.Router();
var request = require('request');
var xml2js = require('xml2js');
var parser = new xml2js.Parser();
var exec = require('child_process').exec,
    child;
var mysql = require('mysql-promise')();
var mysqlConfig = require('../config/db_config.json');
var FCM = require('fcm-push');
mysql.configure(mysqlConfig);
var moment = require('moment');


/*
   전제 조건
   1. 로락 디바이스를 판매자(우리)가 먼저 DB의 lolock_devices에 등록을 해둔다
   2. lolock_devices 등록과 동시에 subscribe를 해둔다. subscribe 이름 : AlldataNoti;
   3. 사용자가 로락 디바이스를 구매한 뒤 앱으로 등록을 하게 되면 앱에서 POST 방식으로 /register로 데이터전송
      그리고 DB table인 lolock_users와 lolock_register에 등록한다.
   4. TODO : 문이 열리거나 특정 상황에 lolock이 Thingplug에 데이터를 전송하면 POST방식으로 /loradata로 데이터가 전송됨
   5. TODO : 기기가 꺼졌다가 다시 켜졌을 시에 lolock에 필요한 동거인 데이터를 전송
   6. TODO : 동거인이 추가될 때 마다 lolock에 블루투스 address?를 전송해야함(첫 기기등록시에도)
*/


//디바이스 controll Module 실행시킬 명령 code와 호출한 곳의 res를 인자로 넘겨준다.
function sendControllMessage(code, device_id, res) {
    var headers = {
        'Accept': 'application/xml',
        'X-M2M-RI': device_id + '_0012', // LoLock_1 / LoLock_2 : 00000174d02544fffef0100d
        'X-M2M-Origin': device_id,
        'uKey': 'STRqQWE5a28zTlJ0QWQ0d0JyZVlBL1lWTkxCOFlTYm4raE5uSXJKTC95eG9NeUxoS3d4ejY2RWVIYStlQkhNSA==',
        'Content-Type': 'application/xml'
    }

    var options = { // 0240771000000174 : AppEUI 와 LTID 는 사용자마다 달라야한다. HOW? / 지금은 테스트라서 직접 입력헀다
        url: 'https://thingplugpf.sktiot.com:9443/0240771000000174/v1_0/mgmtCmd-' + device_id + '_extDevMgmt',
        method: 'PUT',
        headers: headers,
        body: "<?xml version=\"1.0\" encoding=\"UTF-8\"?><m2m:mgc xmlns:m2m=\"http://www.onem2m.org/xml/protocols\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"><exe>true</exe><exra>" + code + "</exra></m2m:mgc>"
    }
    request(options, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            parser.parseString(body, function(err, result) {
                //  console.log(JSON.stringify(result));
                //console.log(result.ThingPlug.result_code);
                //console.log(result.ThingPlug.user[0].uKey);
            });
            console.log(body);
            return res.json({
                code: 'SUCCESS',
                message: '작성 성공'
            });
        }
    });
}

/* GET home page. */
router.get('/', function(req, res, next) {
    console.log("HI");
    res.send("HI");
});

/* GET ukey in xml / uKey를 xml 형식으로 받아서 리턴*/
router.get('/userids/:user_id/passwords/:passwd', function(req, res, next) {
    var headers = {
        'user_id': req.params.user_id,
        'password': req.params.passwd
    }
    var options = {
        url: 'http://onem2m.sktiot.com:9000/ThingPlug?division=user&function=login',
        method: 'PUT',
        headers: headers
    }
    request(options, function(error, response, body) {
        if (!error && response.statusCode == 200) {
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

router.get('/userInfo/:phoneId', function(req, res, next) {
    var userPhoneId = req.params.phoneId;
    var userName;
    mysql.query("SELECT * FROM lolock_users WHERE phone_id=?", [userPhoneId])
        .spread(function(rows) {
            console.log(rows.length);
            if (rows.length == 0) {
                res.json({
                    code: 'NOT REGISTRED',
                    message: '미등록 핸드폰',
                    userInfo: {

                    }
                });
            } else {
                userName = rows[0].name;
                mysql.query("SELECT device_id FROM lolock_register WHERE user_id = ?", [rows[0].id])
                    .spread(function(rows) {
                        console.log(rows.length);
                        if (rows.length != 0) {
                            return mysql.query("SELECT * FROM lolock_devices WHERE id = ?", [rows[0].device_id]);
                        }
                    })
                    .spread(function(rows) {
                        console.log(rows.length);
                        if (rows.length != 0) {
                            res.json({
                                code: 'REGISTRED',
                                messaege: "등록된 핸드폰",
                                userInfo: {
                                    name: userName,
                                    lolockLTID: rows[0].device_id.substring(rows[0].device_id.length - 6, rows[0].device_id.length)
                                }
                            })
                        }
                    });
            }
        });
});


/* GET housemate list and response to app */
router.get('/homemateslist/:LTID', function(req, res, next) {
    console.log(JSON.stringify(req.headers.ltid)); // "Headers 의 LTID 키를 가져옴"
    var LoLockId = "00000174d02544fffe" + req.params.LTID;
    console.log(LoLockId);
    mysql.query("SELECT id FROM lolock_devices WHERE device_id=?", [LoLockId])
        .spread(function(rows) {
            if (rows[0] == null) {
                res.json({
                    code: 'DEVICE_ID_ERR',
                    message: '등록되지 않은 기기'
                });
            } else {
                getDeviceIdFromDB = rows[0].id;
                mysql.query("SELECT * FROM lolock_users WHERE id IN (SELECT user_id FROM lolock_register WHERE device_id=?)", [getDeviceIdFromDB])
                    .spread(function(rows) {
                        var jsonArray = new Array();
                        var count = 0;
                        for (var i in rows) {
                            var jsonObj = {
                                "mateImageUrl": rows[i].profile_url,
                                "mateName": rows[i].name,
                                "mateOutingFlag": rows[i].flag,
                                "mateDoorOpenTime": rows[i].time
                            };
                            jsonArray.push(jsonObj);
                            count++;
                        }
                        var result = {
                            "mates": jsonArray,
                            "mateNumber": count
                        }
                        res.json(result);
                        //res.send(rows);
                    });
            }
        })
    // // TODO : 요청한 앱에 동거인 리스트를 body로 실어서 보냄

})

//LoLock Remote Open
router.put('/remote-open', function(req, res, next) {
    var jsonRes = req.body;
    var openDeviceId = jsonRes.openDeviceId;
    console.log(openDeviceId);
    mysql.query("SELECT id FROM lolock_users WHERE phone_id=?", [openDeviceId])
        .spread(function(rows) {
            console.log(rows);
            return mysql.query("SELECT device_id FROM lolock_register WHERE user_id = ? ", [rows[0].id]);
        })
        .spread(function(rows) {
            console.log(rows);
            return mysql.query("SELECT device_id FROM lolock_devices WHERE id = ? ", [rows[0].device_id]);

        })
        .spread(function(rows) {
            console.log(rows);
            sendControllMessage("1", rows[0].device_id, res);
        })
})

/* PUT Lolock to open / 로락을 원격으로 열 수 있도록 데이터 전송 */

router.put('/remotetest', function(req, res, next) {
    console.log(1);
    // X-M2M-RI , X-M2M-Origin, uKey, Content-Type는 사용자마다 달라야한다. / 지금은 테스트 중이라 직접 입력함
    var headers = {
        'Accept': 'application/xml',
        'X-M2M-RI': '00000174d02544fffef0100d_0012', // LoLock_1 / LoLock_2 : 00000174d02544fffef0100d
        'X-M2M-Origin': '00000174d02544fffef0100d',
        'uKey': 'STRqQWE5a28zTlJ0QWQ0d0JyZVlBL1lWTkxCOFlTYm4raE5uSXJKTC95eG9NeUxoS3d4ejY2RWVIYStlQkhNSA==',
        'Content-Type': 'application/xml'
    }
    /*
      body(xml형식) 양식
      var body = '<?xml version="1.0" encoding="utf-8"?>' +
               '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">'+
                '<soap12:Body>......</soap12:Body></soap12:Envelope>';
      */
    var options = { // 0240771000000174 : AppEUI 와 LTID 는 사용자마다 달라야한다. HOW? / 지금은 테스트라서 직접 입력헀다
        url: 'https://thingplugpf.sktiot.com:9443/0240771000000174/v1_0/mgmtCmd-00000174d02544fffef0100d_extDevMgmt',
        method: 'PUT',
        headers: headers,
        body: "<?xml version=\"1.0\" encoding=\"UTF-8\"?><m2m:mgc xmlns:m2m=\"http://www.onem2m.org/xml/protocols\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"><exe>true</exe><exra>010203</exra></m2m:mgc>"
    }

    request(options, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            parser.parseString(body, function(err, result) {
                console.log(JSON.stringify(result));
                //console.log(result.ThingPlug.result_code);
                //console.log(result.ThingPlug.user[0].uKey);
            });
            res.send(body);
        }
    });
});

/* POST 핸드폰에서 자신이 나갔다고 서버에 로그 등록을 요청 */
router.post('/checkout/:phone_id', function(req, res, next){
  console.log(req.params.phone_id + "가 나갔음")
  mysql.query("SELECT id FROM lolock_users WHERE phone_id=?", req.params.phone_id)
    .spread(function(idrows){
      return mysql.query("SELECT * FROM lolock_register AS R LEFT JOIN lolock_users AS U ON R.user_id = U.id  WHERE R.device_id = (SELECT device_id FROM lolock_register WHERE user_id = ?)", idrows[0].id)
    })
    .spread(function(roommateRows){
      for (var j in roommateRows) {
        var pushData = {}
        if(roommateRows[j].phone_id == req.params.phone_id){
          pushData.pushCode = "0";
          sendPushMessage(roommateRows[j].phone_id, pushData)
            .then(function(text) {
              console.log(text)
            }, function(err) {
              console.log(err)
            });
          var timeArr = moment().format().split('T');
          var dateArr = timeArr[0].split('-');
          var timeArr = timeArr[1].split(':');
          var time = dateArr[0]+dateArr[1]+dateArr[2]+timeArr[0]+timeArr[1];   // 201707232325
          console.log(roommateRows[j].device_id + " " + roommateRows[j].user_id + " " + time + " " + 1);
          mysql.query("INSERT INTO lolock_logs (device_id, user_id, time, out_flag) VALUES (?,?,?,?)",roommateRows[j].device_id, roommateRows[j].user_id, time, 1);
        }
        else{
          pushData.pushCode = "1";
          pushData.message = targetPersonName + "님이 나갔습니다."
          sendPushMessage(roommateRows[j].phone_id, pushData)
            .then(function(text) {
              console.log(text)
            }, function(err) {
              console.log(err)
            });
        }
      }
    })
})

/* POST loRa subscribe한 데이터 전달받는다.*/
router.post('/loradata', function(req, res, next) {
  var notificationMessage = req.body['m2m:cin'];
  var content = notificationMessage.con[0]; // lora 명령어
  var lastModifiedTime = notificationMessage.lt[0]; // Thingplug에 전송된 시간
  var uri = notificationMessage.sr[0].split('/');
  var LTID = uri[3].substring(10);


  console.log(content, lastModifiedTime); // content 2017-07-16T21:35:14+09:00
  console.log(LTID);

  console.log("typeof content : " + typeof content);
  if(content[0] == "3" && content[1] == "0")  // 누군가 나갈때
  {
    console.log("누군가 나갈때 시작");
<<<<<<< HEAD
=======
    // TODO : 각 핸드폰에 요청을 날리고 targetPhone을 찾아야한다.
    // 나중에 입력해야함
    var targetPhone_id = ""
    var targetPersonName = "";

>>>>>>> fdb9b8185d34232cefe431ab928b596b915bd0ce
    mysql.query("SELECT id, addr FROM lolock_devices WHERE device_id=?", LTID)
      .spread(function(rows) {
        console.log("lolock id : " + rows[0].id);
        return mysql.query("SELECT phone_id FROM lolock_users WHERE id IN (SELECT user_id FROM lolock_register WHERE device_id=?)", rows[0].id);
      })
      .spread(function(roommateRows) {
        for (var j in roommateRows) {
          var pushData = {}
          pushData.pushCode = "3";
          sendPushMessage(roommateRows[j].phone_id, pushData)
            .then(function(text) {
              console.log(text)
            }, function(err) {
              console.log(err)
            });
          }
      })
  }
  else if(content[0] == "3" && content[1] == "1") // 누군가 들어올 떄
  {
    console.log("누군가 들어올 때 시작");
  }
  else if(content[0] == "3" && content[1] == "2") // 진동센서에 의해 불법침입이 감지될 때
  {
    console.log("불법침입감지 시작");
    mysql.query("SELECT id FROM lolock_devices WHERE device_id=?", LTID)
      .spread(function(rows) {
        console.log("lolock id : " + rows[0].id  + "->" + LTID + "에서 진동이 감지!!");
        return mysql.query("SELECT phone_id FROM lolock_users WHERE id IN (SELECT user_id FROM lolock_register WHERE device_id=?)", rows[0].id);
      })
      .spread(function(roommateRows) {
        // TODO : 안에서 바로 토큰 받아서 푸시 메세지 날려야한다.
        var dataObj = {};
        dataObj.pushCode = "2";
        dataObj.message = "침입자가 감지되었습니다";
        for (var j in roommateRows) {
          sendPushMessage(roommateRows[j].phone_id, dataObj)
            .then(function(text) {
              console.log(text)
             }, function(err) {
               console.log(err)
             });
          console.log("roommate phone_id : " + roommateRows[j].phone_id);
        }
      })
  }

  /* 위 테스트 중 DB 접근하면 안됌

    // TODO : if content가 불법침입이라면..

    // TODO : else if content가 등록된 사용자의 출입(+ 자동 문열림 기능)이라면
    // 로그도 DB에 남겨야 함
    mysql.query("SELECT id FROM lolock_register WHERE device_id=?", [LTID])
        .spread(function(rows){
          var phoneList = new Array();
          for (var i in rows){
            phoneList.push(mysql.query("SELECT phone_id FROM lolock_users WHERE id=?", rows[i]));
          }
      });
      */

});
router.get('/checkId/:deviceId', function(req, res, next) {
    var deviceId = "00000174d02544fffe" + req.params.deviceId;
    mysql.query("SELECT id FROM lolock_devices WHERE device_id=?", [deviceId])
        .spread(function(rows) {
            if (rows.length == 0) {
                res.json({
                    code: 'DEVICE_ID_ERR',
                    message: '등록되지 않은 기기'
                });
            } else {
                res.json({
                    code: 'DEVICE_ID_AVAILABLE',
                    message: '등록된 기기'
                });
            }
        });
});
router.post('/register', function(req, res, next) {
    var jsonRes = req.body;
    console.log(jsonRes);
    var deviceId = "00000174d02544fffe" + jsonRes.registerDeviceId;
    var userName = jsonRes.registerUserName;
    var userPhoneId = jsonRes.registerUserPhoneId;
    var deviceGPS_lat = jsonRes.registerDeviceGPS_lat;
    var deviceGPS_lon = jsonRes.registerDeviceGPS_lon;
    var deviceAddr = jsonRes.registerDeviceAddr;
    var getDeviceIdFromDB;
    var getUserIdFromDB;
    console.log(deviceId);
    console.log(userName);
    mysql.query("UPDATE lolock_devices SET gps_lat=?,gps_lon=?,addr=? WHERE gps_lat IS NULL", [deviceGPS_lat, deviceGPS_lon, deviceAddr]);
    mysql.query("SELECT id FROM lolock_devices WHERE device_id=?", [deviceId])
        .spread(function(rows) {
            getDeviceIdFromDB = rows[0].id;
            console.log(getDeviceIdFromDB);
            return mysql.query("INSERT INTO lolock_users (name,phone_id) VALUES (?,?)", [userName, userPhoneId]);

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
            console.log(getUserIdFromDB);
            return mysql.query("SELECT * FROM lolock_register WHERE device_id = ?", [getDeviceIdFromDB]);
        })
        .spread(function(rows) {
            res.status(200);
            res.json({
                code: 'SUCCESS',
                message: '등록 성공'
            });
        })
        .catch(function(err) {
            console.log(err);
            res.status(500);
            res.json({
                code: 'DB_ERR',
                message: '데이터베이스 에러'
            });
            // TODO : LoLock Device에 새로운 사용자 정보 전송
        });
});


//출입 기록 관리
router.get('/outing-log/:phoneId', function(req, res, next) {
    var phoneId = req.params.phoneId;
    var randomStr;
    mysql.query("SELECT id FROM lolock_users WHERE phone_id=?", [phoneId])
        .spread(function(rows) {
            console.log(rows);
            return mysql.query("SELECT device_id FROM lolock_register WHERE user_id = ? ", [rows[0].id]);
        })
        .spread(function(rows) {
            return mysql.query("SELECT * FROM lolock_logs AS L LEFT JOIN lolock_users AS U ON L.user_id = U.id WHERE device_id = ? ORDER BY L.time DESC", [rows[0].device_id]);
        })
        .spread(function(rows) {
            console.log(rows);
            if (rows.length == 0) {
                res.send();
            } else {
                var jsonArray = new Array();
                // private String name;
                // private String time;
                // private String strangeFlag;
                // outFlag;
                for (var i in rows) {
                    var resName;
                    var strangeFlag;
                    if (rows[i].id != null) {
                        resName = rows[i].name;
                        strangeFlag = 0;
                    } else {
                        resName = "외부인";
                        strangeFlag = 1;
                    }
                    var resTime = rows[i].time;
                    var jsonObj = {
                        "name": resName,
                        "outFlag": rows[i].out_flag,
                        "strangeFlag": strangeFlag,
                        "outTime": {
                            "month": resTime.substring(0, 2) * 1,
                            "day": resTime.substring(2, 4) * 1,
                            "hour": resTime.substring(4, 6) * 1,
                            "min": resTime.substring(6, 8) * 1
                        }
                    }
                    jsonArray.push(jsonObj);
                }
                res.json(jsonArray);
            }
        })
});

/* GET  */
router.get('/weatherdata/:LTID', function(req, res, next) {
    var LTID = "00000174d02544fffe" + req.params.LTID;
    var gps_lat;
    var gps_lon;
    var addr;
    mysql.query("SELECT id, gps_lat, gps_lon, addr FROM lolock_devices WHERE device_id=?", LTID)
        .spread(function(rows) {
            console.log("id : " + rows[0].id + "device id : " + LTID);
            gps_lat = rows[0].gps_lat;
            gps_lon = rows[0].gps_lon;
            var addrArr = rows[0].addr.split(' ');
            addr = addrArr[1] + " " + addrArr[2];
            return mysql.query("SELECT phone_id FROM lolock_users WHERE id IN (SELECT user_id FROM lolock_register WHERE device_id=?)", rows[0].id);
        })
        .spread(function(roommateRows) {
            var roommateTokenArray = new Array();
            for (var j in roommateRows) {
                roommateTokenArray.push(roommateRows[j].phone_id);
            }
            receiveWeatherInfo(gps_lon, gps_lat, addr, moment().format('YYYY-MM-DDTHH:mm:ssZ'), res);
        })
})

router.get('/open-url/:phoneId', function(req, res, next) {
    var phoneId = req.params.phoneId;
    var randomStr;
    mysql.query("SELECT id FROM lolock_users WHERE phone_id=?", [phoneId])
        .spread(function(rows) {
            console.log(rows);
            return mysql.query("SELECT device_id FROM lolock_register WHERE user_id = ? ", [rows[0].id]);
        })
        .spread(function(rows) {
            console.log(rows);
            return mysql.query("SELECT device_id FROM lolock_devices WHERE id = ? ", [rows[0].device_id]);

        })
        .spread(function(rows) {
            console.log(rows);
            console.log();
            randomStr = Math.random().toString(36).substring(20);
            return mysql.query("INSERT INTO lolock_open_url (device_id,url) VALUES(?,?)", [rows[0].device_id, randomStr]);
        })
        .then(function() {
            res.json({
                code: 'CREATED',
                link: "http://13.124.94.67:10080/Thingplug/disposable-link/" + randomStr
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

router.get('/disposable-link/:linkId', function(req, res, next) {
    var linkId = req.params.linkId;
    var device_id;
    mysql.query("SELECT * FROM lolock_open_url WHERE url = ?", [linkId])
        .spread(function(rows) {
            console.log(rows.length);
            if (rows.length == 0) {
                res.json({
                    code: 'UNDEFINED',
                    message: '존재하지 않는 주소'
                });
            } else {
                device_id = rows[0].device_id;
                return mysql.query("DELETE FROM lolock_open_url WHERE url = ?", [linkId]);
            }
        })
        .then(function() {
            sendControllMessage("1", device_id, res);
        })
        .catch(function(err) {
            console.log(err);
            res.status(500);
            res.json({
                code: 'DB_ERR',
                message: '데이터베이스 에러'
            });
        });;
});

/* 기상청 api를 사용해 현재 지역의 기상정보를 가져옴 */
// 경도       위도    날짜+시간
var receiveWeatherInfo = function(gps_long, gps_lat, addr, lastModifiedTime, responseToReq) {
    var dateArr = lastModifiedTime.split('T')[0].split('-');
    var timeArr = lastModifiedTime.split('T')[1].split(':');
    var date = dateArr[0] + dateArr[1] + dateArr[2];
    var time = Number(timeArr[0] + timeArr[1]);
    time = time - (time % 100) - 100;

    // TODO : 동기화 보장
    if (time < 0) { // time이 00시--분이라면 하루 빼고 2300만들기
        time = '2300'
        date = moment(date).add(-1, 'days').format('YYYYMMDD'); // 하루 빼고 2300
    } else { // 그 외
        var tmp = '0000';
        time += "";
        tmp = tmp.substring(time.length);
        tmp += time;
        time = tmp;
    }
    console.log("date : " + date);
    console.log("time : " + time);
    child = exec("../../a.out 0 " + gps_long + " " + gps_lat, function(error, stdout, stderr) {
        if (error !== null) {
            console.log('exec error: ' + error);
        }
        var nx = stdout.split(' = ')[1].split(',')[0]; // '62, Y'
        var ny = stdout.split(' = ')[2].split('\n')[0];
        console.log("nx : " + nx + " ny : " + ny);

        var GETuri = 'http://newsky2.kma.go.kr/service/SecndSrtpdFrcstInfoService2/ForecastGrib?';
        GETuri += 'ServiceKey=Wl56iXQ3MjJdi%2FO2u34%2BThhi%2F6QDsxA68HvdZ8pZOSo9DlFlvunKzxO1IGUwB6jsSIuDIp8DGEHzvAnoNdgFCQ%3D%3D';
        GETuri += '&base_date=' + date;
        GETuri += '&base_time=' + time;
        GETuri += '&nx=' + nx;
        GETuri += '&ny=' + ny;
        GETuri += '&numOfRows=15';
        GETuri += '&pageNo=1';
        GETuri += '&_type=json';
        var options = {
            url: GETuri,
            method: 'GET',
        }
        var GETforecasturi = 'http://newsky2.kma.go.kr/service/SecndSrtpdFrcstInfoService2/ForecastSpaceData?';
        GETforecasturi += 'ServiceKey=Wl56iXQ3MjJdi%2FO2u34%2BThhi%2F6QDsxA68HvdZ8pZOSo9DlFlvunKzxO1IGUwB6jsSIuDIp8DGEHzvAnoNdgFCQ%3D%3D';
        GETforecasturi += '&base_date=' + date;
        GETforecasturi += '&base_time=0200';
        GETforecasturi += '&nx=' + nx;
        GETforecasturi += '&ny=' + ny;
        GETforecasturi += '&numOfRows=62';
        GETforecasturi += '&pageNo=1';
        GETforecasturi += '&_type=json';
        var forecastoptions = {
            url: GETforecasturi,
            method: 'GET',
        }
        request(options, function(error, response, body) {
            if (response.statusCode == 200) {
                weatherdataModifyRequiredData(body, addr, forecastoptions, function(data) {
                    responseToReq.send(JSON.stringify(data));
                    console.log("날씨 response 성공");
                });
            } else {
                responseToReq.send("기상청 API 에러!")
            }
            // else if (flag === 0 && !error && response.statusCode == 200) {
            //   // TODO : fcm연결 서버에 각 토큰마다 RequiredData 전송 동기화 보장!!!!! 콜백함수 사용하기
            //   weatherdataModifyRequiredData(body, roommateTokenArray, forecastoptions, 0, sendPushMessageToRoommate)
            // }
        });
    })
};
// 푸시 메세지에 pushCode만 필요하고 나머진 필요 없으므로  /loradata 안에서 처리하기로 함
// var sendPushMessageToRoommate = function(roommateTokenArray) {
//   //for (var i in roommateTokenArray) {
//   var repeatPromise = function(cnt, callback) {
//     console.log("cnt : " + cnt);
//     if (cnt == roommateTokenArray.length) {
//       callback();
//       return;
//     }
//     if(roommateTokenArray[cnt] == ){    // 나간 사람 본인
//       var weatherPushData = {};
//       weatherPushData.pushCode = 0;
//       sendPushMessage(roommateTokenArray[cnt], weatherPushData)
//         .then(function(text) {
//           console.log(text)
//           repeatPromise(cnt + 1, callback);
//         }, function(err) {
//           console.log(err)
//           repeatPromise(cnt + 1, callback);
//         })
//     }
//     else{       // 본인 이외에는 누가 나갔다는 푸시메세지 보냄
//
//     }
//   }
//   var cnt = 0;
//   repeatPromise(cnt, function() {
//     console.log("보내기 끝");
//   })
// }
// TODO : data에 인덱스를 달아서 얘가 기상정보 push인지 누가 들어와서 로그를 남기는건지 알려줘야함
var sendPushMessage = function(androidToken, dataObj) {
  return new Promise(function(resolve, reject) {
    // TODO
    var headers = {
      'Content-Type': 'application/json',
      'Authorization': 'key=AAAA-r7E-Qs:APA91bGtjGiMIKAnGL7kF9OedU-ffFttm5rXcaizpAM-hWAUjKme-w4mP2b__NbcH6JbiKHP2A_YpiVTqiLnleCMZIYyt8i20RvxUNPv8U25yMeYrPv6YsWbyZ_OllxniyplDBJqmevO'
    }
    var options = {
      url: 'https://fcm.googleapis.com/fcm/send',
      method: 'POST',
      headers: headers
    }
    var toAppBody = {}; // push 메세지 body
    toAppBody.data = dataObj;
    toAppBody.to = androidToken;
    options.body = JSON.stringify(toAppBody);
    // TODO : 동기화 할 것 promise 사용
    request(options, function(error, response, body) {
      console.log(response.body);
      var bodyobj = eval("(" + response.body + ")");
      // TODO : 지금 모든 인원에게 기상 데이터를 보내고 있다. 다른 인원은 log를 보내야함
      if (bodyobj.success === 1) {
        resolve(androidToken + " 푸시 메세지 보내기 완료");
      } else {
        reject(androidToken + " 푸시 메세지 실패!!!");
      }
    })
}


var weatherdataModifyRequiredData = function(weatherData, addr, forecastoptions, callback) {
    var time = moment().format().split('T')[1].split(':')[0];
    time += "00";

    var weatherDataobj = eval("(" + weatherData + ")");
    var weatherDataItemArray = weatherDataobj['response']['body']['items']['item'];
    var data = new Object();
    data.baseTime = weatherDataItemArray[0].baseTime;
    data.baseDate = weatherDataItemArray[0].baseDate;
    data.probabilityRain = 0;
    data.location = addr;
    console.log("addr : " + data.location);
    for (var i in weatherDataItemArray) {
        if (weatherDataItemArray[i].category === "PTY") {
            data.pty = weatherDataItemArray[i].obsrValue;
        } else if (weatherDataItemArray[i].category === "SKY") {
            data.sky = weatherDataItemArray[i].obsrValue;
        } else if (weatherDataItemArray[i].category === "T1H") {
            data.temperature = weatherDataItemArray[i].obsrValue;
        }
    }
    if (data.pty == 0) {
        if (data.sky == 1)
            data.sky = "맑음";
        else if (data.sky == 2)
            data.sky = "구름조금"
        else if (data.sky == 3)
            data.sky = "구름많음"
        else if (data.sky == 4)
            data.sky = "흐림"
    } else if (data.pty == 1)
        data.sky = "비";
    else if (data.pty == 2)
        data.sky = "비와눈";
    else if (data.pty == 3)
        data.sky = "눈";
    delete data.pty;

    request(forecastoptions, function(error, response, body) {
        if (response.statusCode == 200) {
            var weatherDataobj = eval("(" + body + ")");
            var weatherDataItemArray = weatherDataobj['response']['body']['items']['item'];
            for (var i in weatherDataItemArray) {
                if (weatherDataItemArray[i].category === "TMN") {
                    data.minTemperature = weatherDataItemArray[i].fcstValue;
                } else if (weatherDataItemArray[i].category === "TMX") {
                    data.maxTemperature = weatherDataItemArray[i].fcstValue;
                }
                if (weatherDataItemArray[i].category === "POP" && Number(weatherDataItemArray[i].fcstValue) > data.probabilityRain)
                    data.probabilityRain = weatherDataItemArray[i].fcstValue;
            }
            console.log("data : " + JSON.stringify(data));
            callback(data);
        } else {
            console.log("기상청 API 에러!");
        }
    });
};

module.exports = router;
