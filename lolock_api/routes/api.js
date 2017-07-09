var express = require('express');
var router = express.Router();
var request = require('request');
var mysql = require('mysql-promise')();
var mysqlConfig = require('../config/db_config.json');
mysql.configure(mysqlConfig);



/* GET home page. */
router.get('/', function(req, res, next) {
    console.log("HI");
    res.send();
});

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
            console.log(body);
            res.send(body);
        }
    })
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
