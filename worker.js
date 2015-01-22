/*
 * Fit Demo
 */
/* global self, importScripts, postMessage, distribution, cobyla */

var weibullCDF = function(x, params) {
	"use strict";
	return distribution.weibull(params).cdf(x);
};

var fitCDFtoWeibull = function(pwLinearCDF, start, P01, median, solverP) {
	"use strict";
	// if not provided, estimate starting parameters as:
	// shape = 1, scale = the median (P50), location = P01.
	if (!solverP) {
		solverP = {};
	}
	var maxFun = solverP.maxFun || 6000;
	if (!start) {
		solverP.maxFun = Math.round(maxFun/3);
		start = [1, median, P01];
		var p1 = cobyla.nlFit(pwLinearCDF, weibullCDF, start, [0,0], null, cobyla.constrainAsCDF, solverP);
		// have a second go, starting from scale = avg of min & max
		var minX = pwLinearCDF[0][0], 
			maxX = pwLinearCDF[pwLinearCDF.length-1][0];
		var start2 = [1, (minX+maxX)/2, P01];
		var p2 = cobyla.nlFit(pwLinearCDF, weibullCDF, start2, [0,0], null, cobyla.constrainAsCDF, solverP);
		// then take the better of the two and give it another run through the optimizer
		start = (p1.obj < p2.obj ? p1.params : p2.params);
		maxFun = Math.round(2*maxFun/3); // we will report this as the number of iterations
	}
	var p = cobyla.nlFit(pwLinearCDF, weibullCDF, start, [0,0], null, cobyla.constrainAsCDF, solverP);
	p.maxFun = maxFun;
	return p;
};

self.addEventListener("message", function(event) {
	"use strict";
	importScripts("lib/cobyla/Cobyla.js", "lib/distribution/weibull.js", "nlFit.js");
	postMessage(fitCDFtoWeibull(event.data.cdf, event.data.start, event.data.P01, event.data.median, event.data.solverP));
});

