var express = require('express');
var router = express.Router();
var request = require('request');
var xml2js = require('xml2js');
var parser = new xml2js.Parser();
var mysql = require('mysql-promise')();
var mysqlConfig = require('../config/db_config.json');
var FCM = require('fcm-push');
mysql.configure(mysqlConfig);
var moment = require('moment');
var weatherService = require('./weatherService');
var reqFcm = require('./reqFcm');

router.use(function(res, req, next) {
    console.log(moment().format());
    next();
})

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
            sendControllMessage("26", rows[0].device_id, res);
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
router.get('/checkout/:phone_id', function(req, res, next) {
    console.log(req.params.phone_id + "가 나갔음")
    var name = "";

    mysql.query("UPDATE lolock_users SET flag = 0 WHERE phone_id = ? ", [req.params.phone_id]);
    mysql.query("SELECT id, name FROM lolock_users WHERE phone_id=?", req.params.phone_id)
        .spread(function(idrows) {
            name = idrows[0].name;
            return mysql.query("SELECT * FROM lolock_register AS R LEFT JOIN lolock_users AS U ON R.user_id = U.id  WHERE R.device_id = (SELECT device_id FROM lolock_register WHERE user_id = ?)", idrows[0].id)
        })
        .spread(function(roommateRows) {
            for (var j in roommateRows) {
                var pushData = {}
                if (roommateRows[j].phone_id == req.params.phone_id) {
                    mysql.query("SELECT * FROM lolock_devices WHERE id=?", roommateRows[j].device_id)
                        .spread(function(deviceRows) {
                            // TODO : 기상정보 가져와야함
                            var timeArr = moment().format().split('T');
                            var dateArr = timeArr[0].split('-');
                            var timeArr = timeArr[1].split(':');
                            var time = dateArr[0] + dateArr[1] + dateArr[2] + timeArr[0] + timeArr[1]; // 201707232325
                            weatherService.receiveWeatherInfo(deviceRows[0].gps_lon, deviceRows[0].gps_lat, deviceRows[0].addr, moment().format(), "NULL", function(data) {
                                pushData.pushCode = "0";
                                pushData.message = "날씨:" + data.sky + " 온도:" + data.temperature + " / 오늘 일정 : 4개입니다.";
                                reqFcm.sendPushMessage(roommateRows[j].phone_id, pushData)
                                    .then(function(text) {
                                        console.log(text)
                                    }, function(err) {
                                        console.log(err)
                                    });
                                mysql.query("UPDATE lolock_devices SET temp_out_flag='1' WHERE id=?", roommateRows[j].device_id);
                                console.log(roommateRows[j].device_id + " " + roommateRows[j].user_id + " " + time + " " + 1);
                                mysql.query("INSERT INTO lolock_logs (device_id, user_id, time, out_flag) VALUES (?,?,?,?)", [roommateRows[j].device_id, roommateRows[j].user_id, time, 1])
                                    .catch(function(err) {
                                        console.log("출입로그 기록 실패 in /checkout");
                                    })
                            })
                        })
                } else {
                    pushData.pushCode = "1";
                    pushData.message = name + "님이 나갔습니다."
                    reqFcm.sendPushMessage(roommateRows[j].phone_id, pushData)
                        .then(function(text) {
                            console.log(text)
                        }, function(err) {
                            console.log(err)
                        });
                }
            }
            var sendObj = {
                "code": "SUCCESS",
                "message": "OKAY"
            }
            res.json(sendObj);
        })
        .catch(function(err) {
            console.log(err);
            console.log("DB_ERR in /checkout");
            var sendObj = {
                "code": "FAIL",
                "message": "ID DOESN'T EXIST IN DB"
            }
            res.json(sendObj);
        })
})


/* POST 핸드폰에서 자신이 들어왔다고 서버에 로그 등록을 요청 */
router.get('/checkin/:phone_id', function(req, res, next) {
    console.log(req.params.phone_id + "가 들어왔음")
    var name = "";
    mysql.query("UPDATE lolock_users SET flag = 1 WHERE phone_id = ? ", [req.params.phone_id]);
    mysql.query("SELECT id, name FROM lolock_users WHERE phone_id=?", req.params.phone_id)
        .spread(function(idrows) {
            name = idrows[0].name;
            return mysql.query("SELECT * FROM lolock_register AS R LEFT JOIN lolock_users AS U ON R.user_id = U.id  WHERE R.device_id = (SELECT device_id FROM lolock_register WHERE user_id = ?)", idrows[0].id)
        })
        .spread(function(roommateRows) {
            for (var j in roommateRows) {
                var pushData = {};
                if (roommateRows[j].phone_id == req.params.phone_id) {
                    var timeArr = moment().format().split('T');
                    var dateArr = timeArr[0].split('-');
                    var timeArr = timeArr[1].split(':');
                    var time = dateArr[0] + dateArr[1] + dateArr[2] + timeArr[0] + timeArr[1]; // 201707232325
                    console.log(roommateRows[j].device_id + " " + roommateRows[j].user_id + " " + time + " " + 1);
                    mysql.query("UPDATE lolock_devices SET temp_out_flag='1' WHERE id=?", roommateRows[j].device_id);
                    mysql.query("INSERT INTO lolock_logs (device_id, user_id, time, out_flag) VALUES (?,?,?,?)", [roommateRows[j].device_id, roommateRows[j].user_id, time, 0])
                        .catch(function(err) {
                            console.log("출입로그 기록 실패 in /checkout");
                        })
                } else {
                    pushData.pushCode = "1";
                    pushData.message = name + "님이 들어왔습니다."
                    reqFcm.sendPushMessage(roommateRows[j].phone_id, pushData)
                        .then(function(text) {
                            console.log(text)
                        }, function(err) {
                            console.log(err)
                        });
                }
            }
            var sendObj = {
                "code": "SUCCESS",
                "message": "OKAY"
            }
            res.json(sendObj);
        })
        .catch(function(err) {
            console.log(err);
            console.log("DB_ERR in /checkout");
            var sendObj = {
                "code": "FAIL",
                "message": "ID DOESN'T EXIST IN DB"
            }
            res.json(sendObj);
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
    if (content[0] == "3" && content[1] == "0") // 누군가 나갈때
    {
        console.log("누군가 나갈때 시작");
        reqFcm.sendPushToRoommate(LTID, "3", "");
        setTimeout(checkTrespassing, 10000, LTID);
    } else if (content[0] == "3" && content[1] == "1") // 누군가 들어올 떄
    {
        console.log("누군가 들어올 때 시작");
        reqFcm.sendPushToRoommate(LTID, "4", "");
        setTimeout(checkTrespassing, 10000, LTID);
    } else if (content[0] == "3" && content[1] == "2") // 진동센서에 의해 불법침입이 감지될 때
    {
        console.log("불법침입감지 시작");
        reqFcm.sendPushToRoommate(LTID, "2", "비정상적인 충격이 감지되었습니다.");
    }
    res.send();
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
    mysql.query("UPDATE lolock_devices SET gps_lat=?,gps_lon=?,addr=? WHERE device_id = ? AND gps_lat IS NULL", [deviceGPS_lat, deviceGPS_lon, deviceAddr, deviceId]);
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
                    var week = new Array('일', '월', '화', '수', '목', '금', '토');
                    var today = new Date(resTime.substring(0, 4) + '-' + resTime.substring(4, 6) * 1 + '-' + resTime.substring(6, 8) * 1 + " " + resTime.substring(8, 10) * 1 + ":" + resTime.substring(10, 12) * 1);
                    var todayLabel = week[today.getDay()];
                    console.log(today.getTime() + " " + resTime.substring(0, 4) + '-' + resTime.substring(4, 6) * 1 + '-' + resTime.substring(6, 8) * 1);
                    console.log(new Date().getTime());
                    var jsonObj = {
                        "name": resName,
                        "outFlag": rows[i].out_flag,
                        "strangeFlag": strangeFlag,
                        "outTime": {
                            "month": resTime.substring(4, 6) * 1,
                            "day": resTime.substring(6, 8) * 1,
                            "hour": resTime.substring(8, 10) * 1,
                            "min": resTime.substring(10, 12) * 1,
                            "dayName": todayLabel,
                            "timeStamp": new Date().getTime() - today.getTime()
                        }
                    }
                    jsonArray.push(jsonObj);
                }
                var jsonRes = {
                    "results": jsonArray
                }
                res.json(jsonRes);
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
            weatherService.receiveWeatherInfo(gps_lon, gps_lat, addr, moment().format('YYYY-MM-DDTHH:mm:ssZ'), res);
        })
        .catch(function(err) {
            console.log(err);
            var sendObj = {
                "code": "FAIL",
                "message": "DB_ERR"
            }
            res.json(sendObj);
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

router.delete('/disposable-link/:linkId', function(req, res, next) {
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
                mysql.query("DELETE FROM lolock_open_url WHERE url = ?", [linkId])
                    .then(function() {
                      var timeArr = moment().format().split('T');
                      var dateArr = timeArr[0].split('-');
                      var timeArr = timeArr[1].split(':');
                      var time = dateArr[0] + dateArr[1] + dateArr[2] + timeArr[0] + timeArr[1]; // 201707232325
                      sendControllMessage("26", device_id, res);
                      // TODO : open_url을 통해 누가 문을 열었다고 동거인에게 알려줌
                      reqFcm.sendPushToRoommate(device_id, "1", "임시키를 통해 누군가 들어왔습니다.");
                      mysql.query("SELECT id FROM lolock_devices WHERE device_id=?", device_id)
                        .spread(function(rows){
                          return mysql.query("INSERT INTO lolock_logs (device_id, time, out_flag) VALUES (?,?,?)", [rows[0].id, time, 1]);
                        })
                        .catch(function(err){
                          console.log(err);
                          console.log("임시키 로그 등록 실패");
                        })
                    })
                    .catch(function(err) {
                        console.log(err);
                        res.status(500);
                        res.json({
                            code: 'DB_ERR',
                            message: '데이터베이스 에러'
                        });
                    });
            }
        })
})

router.get('/disposable-link/:linkId', function(req, res, next) {
    res.sendfile('open_url.html');
});



//불법침임 감지
var checkTrespassing = function(arg) {
    mysql.query("SELECT temp_out_flag FROM lolock_devices WHERE device_id = ?", [arg])
        .spread(function(rows) {
          console.log(rows);
            if (rows[0].temp_out_flag == null) {
                reqFcm.sendPushToRoommate(arg, "2", "등록되지 않은 사용자가 침입했습니다.");
            }
            mysql.query("UPDATE lolock_devices SET temp_out_flag = NULL WHERE device_id = ? ", [arg]);
        }).catch(function(err) {
            console.log("출입로그 기록 실패 in /checkout");
        })
};
module.exports = router;
