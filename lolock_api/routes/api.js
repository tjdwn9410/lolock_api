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


/* GET housemate list and response to app */
router.get('/homemateslist/:LTID', function(req, res, next) {
  console.log(JSON.stringify(req.headers.ltid)); // "Headers 의 LTID 키를 가져옴"
  var LoLockId = req.params.LTID;
  mysql.query("SELECT id FROM lolock_devices WHERE device_id=?", [LoLockId])
    .spread(function(rows) {
      if (rows[0] == null) {
        res.json({
          code: 'DEVICE_ID_ERR',
          message: '등록되지 않은 기기'
        });
      } else {
        getDeviceIdFromDB = rows[0].id;
        return mysql.query("SELECT * FROM lolock_users WHERE id IN (SELECT user_id FROM lolock_register WHERE device_id=?)", [getDeviceIdFromDB]);
      }
    })
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

/* POST loRa subscribe한 데이터 전달받는다.*/
router.post('/loradata', function(req, res, next) {
  var notificationMessage = req.body['m2m:cin'];
  var content = notificationMessage.con[0]; // lora 명령어
  var lastModifiedTime = notificationMessage.lt[0]; // Thingplug에 전송된 시간
  var uri = notificationMessage.sr[0].split('/');
  var LTID = uri[3].substring(10);

  console.log(content, lastModifiedTime); // content 2017-07-16T21:35:14+09:00
  console.log(LTID);
  console.log('\n');


  mysql.query("SELECT id FROM lolock_devices WHERE device_id=?", LTID)
    .spread(function(rows) {
      console.log(rows[0].id);
      return mysql.query("SELECT phone_id, gps_lat, gps_lon FROM lolock_users WHERE id IN (SELECT user_id FROM lolock_register WHERE device_id=?)", rows[0].id);
    })
    .spread(function(roomateRows) {
      // TODO : 안에서 바로 토큰 받아서 푸시 메세지 날려야한다.
      var roomateTokenArray = new Array();
      for (var j in roomateRows) {
        roomateTokenArray.push(roomateRows[j].phone_id);
      }
      receiveWeatherInfo(roomateTokenArray, roomateRows[0].gps_lon, roomateRows[0].gps_lat, lastModifiedTime, 0);
    })
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

router.post('/register', function(req, res, next) {
  var jsonRes = req.body;
  var deviceId = "00000174d02544fffe" + jsonRes.registerLoraId;
  var userName = jsonRes.registerUserName;
  var userPhoneId = jsonRes.registerUserPhoneId;
  var userBluetoothId = jsonRes.registerUserBluetoothId;
  var userGPS_lat = jsonRes.registerUserGPS_lat;
  var userGPS_lon = jsonRes.registerUserGPS_lon;
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
        return mysql.query("INSERT INTO lolock_users (name,phone_id,bluetooth_id,gps_lat,gps_lon) VALUES (?,?,?,?,?)", [userName, userPhoneId, userBluetoothId, userGPS_lat, userGPS_lon]);
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
      console.log(getUserIdFromDB);
      return mysql.query("SELECT * FROM lolock_register WHERE device_id = ?", [getDeviceIdFromDB]);
    })
    .spread(function(rows) {
      res.status(201);
      sendControllMessage("00" + rows.length + userBluetoothId, deviceId, res);
      // 0 멤버등록
      // 외출상태 (0 or 1)
      // 멤버인덱스
      // bluetooth_id
      // res.json({
      //     code: 'SUCCESS',
      //     message: '작성 성공'
      // });
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

/* GET  */
router.get('/weatherdata/:LTID', function(req, res, next) {
  var LTID = req.params.LTID;

  mysql.query("SELECT id FROM lolock_devices WHERE device_id=?", LTID)
    .spread(function(rows) {
      console.log(rows[0].id);
      return mysql.query("SELECT phone_id, gps_lat, gps_lon FROM lolock_users WHERE id IN (SELECT user_id FROM lolock_register WHERE device_id=?)", rows[0].id);
    })
    .spread(function(roomateRows) {
      var roomateTokenArray = new Array();
      for (var j in roomateRows) {
        roomateTokenArray.push(roomateRows[j].phone_id);
      }
      receiveWeatherInfo(roomateTokenArray, roomateRows[0].gps_lon, roomateRows[0].gps_lat, lastModifiedTime, 1, res);
    })
})

/* 기상청 api를 사용해 현재 지역의 기상정보를 가져옴 */
// 경도       위도    날짜+시간
var receiveWeatherInfo = function(roomateTokenArray, gps_long, gps_lat, lastModifiedTime, flag, responseToReq) {
  var dateArr = lastModifiedTime.split('T')[0].split('-');
  var timeArr = lastModifiedTime.split('T')[1].split(':');
  var date = dateArr[0] + dateArr[1] + dateArr[2];
  var time = Number(timeArr[0] + timeArr[1]);
  time = time - (time % 100) - 100;

  // TODO : 동기화 보장
  if (time < 0) { // time이 00시--분이라면 하루 빼고 2300만들기
    time = '2300'
    moment(lastModifiedTime);
    date = moment().add(-1, 'days').format('YYYYMMDD'); // 하루 빼고 2300
  } else { // 그 외
    var tmp = '0000';
    time += "";
    tmp = tmp.substring(time.length);
    tmp += time;
    time = tmp;
  }

  child = exec("../../a.out 0 " + gps_long + " " + gps_lat, function(error, stdout, stderr) {
    if (error !== null) {
      console.log('exec error: ' + error);
    }
    var nx = stdout.split(' = ')[1].split(',')[0]; // '62, Y'
    var ny = stdout.split(' = ')[2].split('\n')[0];
    console.log("nx : " + nx + " ny : " + ny);

    var GETuri = 'http://newsky2.kma.go.kr/service/SecndSrtpdFrcstInfoService2/ForecastGrib?';
    GETuri += 'ServiceKey=fnu5UNOGf0qmYIWbwbWTW8vtKs5JAJqQdo9afbZwmQM6WPx6B97QxohwO7TI3S9Msx0BFFlfJxfE%2BSJ5OEtf3w%3D%3D';
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
    request(options, function(error, response, body) {
      if(flag === 1){
        responseToReq.send(JSON.stringify(weatherdataModifyRequiredData(body, function(){
          console.log("날씨 response 성공");
        })));
      }
      else if (!error && response.statusCode == 200) {
        // TODO : fcm연결 서버에 각 토큰마다 RequiredData 전송 동기화 보장!!!!! 콜백함수 사용하기
        weatherdataModifyRequiredData(body, sendPushMessageToRoommate)
      }
    });
  })
};

var sendPushMessageToRoommate = function(weatherRequiredData) {
  //for (var i in roomateTokenArray) {
  var repeatPromise = function(cnt, callback) {
    console.log("cnt : " + cnt);
    if (cnt == roomateTokenArray.length) {
      callback();
      return;
    }
    sendPushMessage(roomateTokenArray[cnt], weatherRequiredData)
      .then(function(text) {
        console.log(text)
        repeatPromise(cnt + 1, callback);
      }, function(err) {
        console.log(err)
        repeatPromise(cnt + 1, callback);
      })
  }
  var cnt = 0;
  repeatPromise(cnt, function() {
    console.log("보내기 끝");
  })
}

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
        resolve(androidToken + "보내기 완료");
      } else {
        reject(androidToken + "실패!!!");
      }
    })
  })
}


var weatherdataModifyRequiredData = function(weatherData, callback) {
  var PTYItem = {}; // 강수 형태  / 0 : 없음 / 1 : 비 / 2: 비/눈 / 3 : 눈
  var SKYItem = {}; // 하늘 상태  / 1 : 맑음 / 2: 구름 조금 / 3: 구름 많음 / 4 : 흐림
  var T1HItem = {}; // 1시간 기온 / 온도로 나옴

  var weatherDataobj = eval("(" + weatherData + ")");
  var weatherDataItemArray = weatherDataobj['response']['body']['items']['item'];
  var data = new Object();
  data.baseTime = weatherDataItemArray[0].baseTime;
  data.baseDate = weatherDataItemArray[0].baseDate;

  for (var i in weatherDataItemArray) {
    if (weatherDataItemArray[i].category === "PTY") {
      PTYItem.category = weatherDataItemArray[i].category;
      PTYItem.obsrValue = weatherDataItemArray[i].obsrValue;
    } else if (weatherDataItemArray[i].category === "SKY") {
      SKYItem.category = weatherDataItemArray[i].category;
      SKYItem.obsrValue = weatherDataItemArray[i].obsrValue;
    } else if (weatherDataItemArray[i].category === "T1H") {
      T1HItem.category = weatherDataItemArray[i].category;
      T1HItem.obsrValue = weatherDataItemArray[i].obsrValue;
    }
  }

  data.items = new Array(PTYItem, SKYItem, T1HItem);
  console.log("data : " + JSON.stringify(data));

  callback(data);
  return data;
};

module.exports = router;
