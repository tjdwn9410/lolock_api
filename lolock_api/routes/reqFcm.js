/*
  FCM 서버에 안드로이드 푸시 메세지 보내기 요청 기능 모듈
  관련 정보 : https://firebase.google.com/docs/cloud-messaging/server?hl=ko
*/
var mysql = require('mysql-promise')();
var request = require('request');
module.exports.sendPushMessage = function(androidToken, dataObj) {
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

        console.log("dataObj : " + dataObj);

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
    });
}

module.exports.sendPushToRoommate = function(LTID, pushCode, pushMessage) {
    mysql.query("SELECT id FROM lolock_devices WHERE device_id=?", LTID)
        .spread(function(rows) {
            console.log("lolock id : " + rows[0].id);
            return mysql.query("SELECT phone_id FROM lolock_users WHERE id IN (SELECT user_id FROM lolock_register WHERE device_id=?)", rows[0].id);
        })
        .spread(function(roommateRows) {
            for (var j in roommateRows) {
                var pushData = {}
                pushData.pushCode = pushCode;
                pushData.message = pushMessage;
                sendPushMessage(roommateRows[j].phone_id, pushData)
                    .then(function(text) {
                        console.log(text)
                    }, function(err) {
                        console.log(err)
                    });
            }
        })
        .catch(function(err) {
            console.log(err);
            console.log("DB_ERR");
        })
}
