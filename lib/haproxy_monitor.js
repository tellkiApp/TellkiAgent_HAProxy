/**
* This script was developed by Guberni and is part of Tellki's Monitoring Solution
*
* APRIL, 2015
* 
* Version 1.0
*
* DESCRIPTION: Monitor HAProxy utilization
*
* SYNTAX: node haproxy_monitor.js <HOST> <METRIC_STATE> <FILTER_PROXY> <FILTER_SERVER> <USER_NAME> <PASS_WORD>
* 
* EXAMPLE: node haproxy_monitor.js "http://demo.1wt.eu/;csv" "1,1,1,1,1,1,1,1,1,1,1,1" "proxy;http" "frontend;backend" "user" "pwd"
*
* README:
*		<HOST> Status URL for CSV.
*
*		<METRIC_STATE> is generated internally by Tellki and it's only used by Tellki default monitors.
*		1 - metric is on ; 0 - metric is off
*
*		<FILTER_PROXY> List of proxies to filter results.
*
*		<FILTER_SERVER> List of servers to filter results.
*
*		<USER_NAME>, <PASS_WORD> are only required if you want to monitor a password protected address. If you want to use this
*		script to monitor a non password protected address, leave this parameters empty ("") but you still need to
*		pass them to the script.
**/

var urlLib = require("url");
var fs = require('fs');

var tempDir = "/tmp";

// METRICS IDS
var metrics = [];
metrics["qcur"] =  {id:"1495:Current Queued Requests:4",index:2,ratio:false};
metrics["scur"] =  {id:"1496:Current Sessions:4",index:4,ratio:false};
metrics["stot"] =  {id:"1497:Total Sessions/Sec:4",index:7,ratio:true};
metrics["bin"] =  {id:"1498:Bytes in/Sec:4",index:8,ratio:true};
metrics["bout"] =  {id:"1499:Bytes out/Sec:4",index:9,ratio:true};
metrics["ereq"] =  {id:"1500:Request Errors/Sec:4",index:12,ratio:true};
metrics["econ"] =  {id:"1501:Connection Errors/Sec:4",index:13,ratio:true};
metrics["eresp"] =  {id:"1502:Repsonse Errors/Sec:4",index:14,ratio:true};
metrics["act"] =  {id:"1503:Server is Active:9",index:19,ratio:false};
metrics["bck"] =  {id:"1504:Server is Backup:9",index:20,ratio:false};
metrics["backend_act"] =  {id:"1505:Number of Active Servers:4",index:19,ratio:false};
metrics["backend_bck"] =  {id:"1506:Number of Backup Servers:4",index:20,ratio:false};

var metricsLength = 12;

// ############# INPUT ###################################

//START
(function() {
	try
	{
		monitorInput(process.argv.slice(2));
	}
	catch(err)
	{	
		if(err instanceof InvalidParametersNumberError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else if(err instanceof InvalidAuthenticationError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else
		{
			console.log(err.message);
			process.exit(1);
		}
	}
}).call(this)


/*
* Verify number of passed arguments into the script.
*/
function monitorInput(args)
{
	
	if(args.length != 6)
	{
		throw new InvalidParametersNumberError();
	}		
	
	monitorInputProcess(args);
}


/*
* Process the passed arguments and send them to monitor execution (monitorHAProxy)
* Receive: arguments to be processed
*/
function monitorInputProcess(args)
{
	//<URL>
	var url = args[0];
	
	//<METRIC_STATE>
	var metricState = args[1].replace("\"", "");
	var tokens = metricState.split(",");
	
	var metricsExecution = new Array(metricsLength);

	for(var i in tokens)
	{
		metricsExecution[i] = (tokens[i] === "1");
	}
	
	// <FILTER_PROXY>
	var filtersProxyParameter = args[2].replace("\"", "");
	var filtersProxy = [];
	
	if(filtersProxyParameter.length > 0)
	{
		filtersProxy = filtersProxyParameter.split(";");
	}	
	
	// <FILTER_SERVER>
	var filtersServerParameter = args[3].replace("\"", "");
	var filtersServer = [];
	
	if(filtersServerParameter.length > 0)
	{
		filtersServer = filtersServerParameter.split(";");
	}	
	
	// <USER_NAME>
	var username = args[4];
	username = username === "\"\"" ? "" : username;
	if(username.length === 1 && username === "\"")
		username = "";
	username = username.length === 0 ? null : username;
		
	
	// <PASS_WORD>
	var passwd = args[5];
	passwd = passwd === "\"\"" ? "" : passwd;
	if(passwd.length === 1 && passwd === "\"")
		passwd = "";
	passwd = passwd.length === 0 ? null : passwd;
	
	
	//create regExpProxy
	var regExpProxy = "";
	if(filtersProxy.length > 0)
		regExpProxy = new RegExp(filtersProxy.join("|"), "i"); //ignore case
		
	//create regExpServer
	var regExpServer = "";
	if(filtersServer.length > 0)
		regExpServer = new RegExp(filtersServer.join("|"), "i"); //ignore case
	
	//create request object to pass to the monitor
	var request = new Object()
	request.url = url;
	request.metricsExecution = metricsExecution;
	request.regExpProxy = regExpProxy;
	request.regExpServer = regExpServer;
	request.username = username;
	request.passwd = passwd;
	
	//call monitor
	monitorHAProxy(request);
	
}


//################# HAPROXY ###########################

/*
* Retrieve metrics information
* Receive: object request containing configuration
*/
function monitorHAProxy(request) {

    var _url = urlLib.parse(request.url);
	
	var http;
	
	//select type of module to use (http or https)
	if (_url.protocol == 'http:') 
	{
		http = require("http");
	}
	else
	{
		http = require("https");
	}
	
	// create http request options
    var options;
    options = {
        hostname: _url.hostname,
        path: _url.path,
        method: 'GET',
        auth: '',
    };
	
	
    if (request.username != null && request.passwd != null) {
        options.auth = request.username + ':' + request.passwd;
    }

	//do http request
    var req = http.request(options, function (res) {
        var data = '';
		
		//http response status code 
        var code = res.statusCode;
        res.setEncoding('utf8');
		
		if (code != 200)
		{
			if (code == 401)
			{
				errorHandler(new InvalidAuthenticationError());
			}
			else
			{
				var exception = new HTTPError();
				exception.message = "Response error (" + code + ").";
				errorHandler(exception);
			}
		}
		
        // receive data
        res.on('data', function (chunk) {
            data += chunk;
        });
		
        // On http request end
        res.on('end', function (res) {
		
			parseData(data, request);

        });
    });
    // On Error
    req.on('error', function (e) {
        if(e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED')
			errorHandler(new UnknownHostError());
		else
			errorHandler(e);
    });
	
    req.end();
}


function parseData(data, request)
{
	var d = data.split("\n");
	
	var metricsName = Object.keys(metrics);
	
	var jsonString = "[";
				
	var dateTime = new Date().toISOString();
	
	for(var i = 1; i < d.length-1; i++)
	{
		var fields = d[i].split(",")
		
		//apply filter
		//if not match with proxy name or server name go to next iteration
		if((request.regExpProxy != "" && !request.regExpProxy.test(fields[0])) || (request.regExpServer != "" && !request.regExpServer.test(fields[1])))
		{
			continue;
		}
		
		for(var j = 0; j < metricsName.length; j++)
		{
			if(request.metricsExecution[j])
			{
				var metric = metrics[metricsName[j]];
			
				//do not retrieve act and bck for backends
				//do not retrieve backend_act and backend_bck for servers
				if((metricsName[j].indexOf("backend") != -1 &&  fields[1].toLowerCase() != "backend")
				|| (fields[1].toLowerCase() == "backend" && (metricsName[j] == "act" || metricsName[j] == "bck")))
				{
					continue;
				}
				
				var value = fields[metric.index];
				
				jsonString += "{";
								
				jsonString += "\"variableName\":\""+metricsName[j]+"\",";
				jsonString += "\"metricUUID\":\""+metric.id+"\",";
				jsonString += "\"timestamp\":\""+ dateTime +"\",";
				jsonString += "\"value\":\""+ value +"\",";
				jsonString += "\"object\":\""+ fields[0]+":"+ fields[1] +"\"";
				
				jsonString += "},";
				
			}
			
		}
	}
	
	
	if(jsonString.length > 1)
		jsonString = jsonString.slice(0, jsonString.length-1);
			
	jsonString += "]";
	
	processDeltas(request, jsonString)
	
}


//################### OUTPUT METRICS ###########################

/*
* Send metrics to console
* Receive: metrics list to output
*/
function output(toOutput)
{
	for(var i in toOutput)
	{
		if(toOutput[i].value != "" && !isNaN(toOutput[i].value))
		{
		
			var out = "";
			
			out += toOutput[i].id + "|";
			out += toOutput[i].value;
			out += "|";
			out += toOutput[i].object;
			out += "|";
			
			console.log(out);
		}
	}
}

//################### ERROR HANDLER #########################
/*
* Used to handle errors of async functions
* Receive: Error/Exception
*/
function errorHandler(err)
{
	if(err instanceof InvalidAuthenticationError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else if(err instanceof HTTPError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else if(err instanceof UnknownHostError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else if(err instanceof CreateTmpDirError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else if(err instanceof WriteOnTmpFileError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else
	{
		console.log(err.message);
		process.exit(1);
	}
}
	




// ##################### UTILS #####################
/*
* Process performance results
* Receive: 
* - request object containing configuration
* - retrived results
*/
function processDeltas(request, results)
{
	var file = getFile(request.url);
	
	var toOutput = [];
	
	if(file)
	{		
		var previousData = JSON.parse(file);
		var newData = JSON.parse(results);
			
		for(var i = 0; i < newData.length; i++)
		{
			var endMetric = newData[i];
			var initMetric = null;
			
			for(var j = 0; j < previousData.length; j++)
			{
				if(previousData[j].metricUUID === newData[i].metricUUID && previousData[j].object === newData[i].object)
				{
					initMetric = previousData[j];
					break;
				}
			}
			
			if (initMetric != null)
			{
				var deltaValue = getDelta(initMetric, endMetric);
				
				var rateMetric = new Object();
				rateMetric.id = endMetric.metricUUID;
				rateMetric.timestamp = endMetric.timestamp;
				rateMetric.value = deltaValue;
				rateMetric.object = endMetric.object;
				
				toOutput.push(rateMetric);
			}
			else
			{	
				var rateMetric = new Object();
				rateMetric.id = endMetric.metricUUID;
				rateMetric.timestamp = endMetric.timestamp;
				rateMetric.value = 0;
				rateMetric.object = endMetric.object;
				
				toOutput.push(rateMetric);
			}
		}
		
		setFile(request.url, results);

		for (var m = 0; m < toOutput.length; m++)
		{
			for (var z = 0; z < newData.length; z++)
			{
				var systemMetric = metrics[newData[z].variableName];
				
				if (systemMetric.ratio === false && newData[z].metricUUID === toOutput[m].id && newData[z].object === toOutput[m].object)
				{
					toOutput[m].value = newData[z].value;
					break;
				}
			}
		}

		output(toOutput)
		
	}
	else
	{
		setFile(request.url, results);
		process.exit(0);
	}
}


/*
* Calculate ratio metric's value
* Receive: 
* - previous value
* - current value
* - 
*/
function getDelta(initMetric, endMetric)
{
	var deltaValue = 0;

	var decimalPlaces = 2;

	var date = new Date().toISOString();
	
	if (parseFloat(endMetric.value) < parseFloat(initMetric.value))
	{	
		deltaValue = parseFloat(endMetric.value).toFixed(decimalPlaces);
	}
	else
	{	
		var elapsedTime = (new Date(endMetric.timestamp).getTime() - new Date(initMetric.timestamp).getTime()) / 1000;	
		deltaValue = ((parseFloat(endMetric.value) - parseFloat(initMetric.value))/elapsedTime).toFixed(decimalPlaces);
	}
	
	return deltaValue;
}



/*
* Get last results if any saved
* Receive: 
* - haproxy csv url path
*/
function getFile(url)
{

		var dirPath =  __dirname +  tempDir + "/";
		var filePath = dirPath + ".haproxy_"+ encodeURIComponent(url) +".dat";
		
		try
		{
			fs.readdirSync(dirPath);
			
			var file = fs.readFileSync(filePath, 'utf8');
			
			if (file.toString('utf8').trim())
			{
				return file.toString('utf8').trim();
			}
			else
			{
				return null;
			}
		}
		catch(e)
		{
			return null;
		}
}



/*
* Save current metrics values to be used to calculate ratios on next runs
* Receive: 
* - haproxy csv url path
* - retrieved result
*/
function setFile(url, json)
{
	var dirPath =  __dirname +  tempDir + "/";
	var filePath = dirPath + ".haproxy_"+ encodeURIComponent(url) +".dat";
		
	if (!fs.existsSync(dirPath)) 
	{
		try
		{
			fs.mkdirSync( __dirname+tempDir);
		}
		catch(e)
		{
			var ex = new CreateTmpDirError(e.message);
			ex.message = e.message;
			errorHandler(ex);
		}
	}

	try
	{
		fs.writeFileSync(filePath, json);
	}
	catch(err)
	{
		var ex = new WriteOnTmpFileError(e.message);
		ex.message = err.message;
		errorHandler(ex);
	}
}


//####################### EXCEPTIONS ################################

//All exceptions used in script

function InvalidParametersNumberError() {
    this.name = "InvalidParametersNumberError";
    this.message = ("Wrong number of parameters.");
	this.code = 3;
}
InvalidParametersNumberError.prototype = Object.create(Error.prototype);
InvalidParametersNumberError.prototype.constructor = InvalidParametersNumberError;

function InvalidAuthenticationError() {
    this.name = "InvalidAuthenticationError";
    this.message = "Invalid authentication.";
	this.code = 2;
}
InvalidAuthenticationError.prototype = Object.create(Error.prototype);
InvalidAuthenticationError.prototype.constructor = InvalidAuthenticationError;

function UnknownHostError() {
    this.name = "UnknownHostError";
    this.message = "Unknown host.";
	this.code = 29;
}
UnknownHostError.prototype = Object.create(Error.prototype);
UnknownHostError.prototype.constructor = UnknownHostError;

function HTTPError() {
    this.name = "HTTPError";
    this.message = "";
	this.code = 19;
}
HTTPError.prototype = Object.create(Error.prototype);
HTTPError.prototype.constructor = HTTPError;

function CreateTmpDirError()
{
	this.name = "CreateTmpDirError";
    this.message = "";
	this.code = 21;
}
CreateTmpDirError.prototype = Object.create(Error.prototype);
CreateTmpDirError.prototype.constructor = CreateTmpDirError;


function WriteOnTmpFileError()
{
	this.name = "WriteOnTmpFileError";
    this.message = "";
	this.code = 22;
}
WriteOnTmpFileError.prototype = Object.create(Error.prototype);
WriteOnTmpFileError.prototype.constructor = WriteOnTmpFileError;

