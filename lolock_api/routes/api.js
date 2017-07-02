var express = require('express');
var router = express.Router();
var request = require('request');

/* GET home page. */
router.get('/', function(req, res, next) {
  console.log("HI");
  res.send();
});

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
      console.log(body);
      res.send(body);
    }
  })
});

module.exports = router;
