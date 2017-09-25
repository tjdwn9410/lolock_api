var exec = require('child_process').exec,
    child;
var moment = require('moment');
var request = require('request');


/* 기상청 api를 사용해 현재 지역의 기상정보를 가져옴 */
// 경도       위도    날짜+시간
module.exports.receiveWeatherInfo = function(gps_long, gps_lat, addr, lastModifiedTime, responseToReq, callback) {
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
        if (Number(time) <= 100 && timeArr[1] < 10)
            date = moment(date).add(-1, 'days').format('YYYYMMDD'); // 하루 빼고 2300
        var GETforecasturi = 'http://newsky2.kma.go.kr/service/SecndSrtpdFrcstInfoService2/ForecastSpaceData?';
        GETforecasturi += 'ServiceKey=fnu5UNOGf0qmYIWbwbWTW8vtKs5JAJqQdo9afbZwmQM6WPx6B97QxohwO7TI3S9Msx0BFFlfJxfE%2BSJ5OEtf3w%3D%3D';
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
                    if (responseToReq != "NULL") {
                        responseToReq.send(JSON.stringify(data));
                        console.log("날씨 response 성공");
                    } else {
                        callback(data);
                    }
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
        var weatherDataobj = eval("(" + body + ")");
        if (response.statusCode == 200) {
            if (weatherDataobj['response']['header']['resultCode'] == "0000") {
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
                data.code = "SUCCESS";
                console.log("data : " + JSON.stringify(data));
                callback(data);
            } else {
                var sendObj = {
                    "code": "FAIL",
                    "message": "WRONG_DATE"
                }
                console.log("기상청 API 날짜 에러!");
            }
        } else {
            var sendObj = {
                "code": "FAIL",
                "message": "National Weather Service API ERR"
            }
            console.log("기상청 API 에러!");
        }
    });
};
