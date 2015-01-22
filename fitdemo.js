/*
 * Fit Demo
 */
/* global fitdemo: true, jQuery, d3, _, distribution, cobyla */

fitdemo = (function(my, $, d3, _, cobyla, distribution) {
	"use strict";
	
	var xt = {formatter: function(v) {
	          		var a = Math.abs(v);
	          		var f = d3.format(",.3r");
	          		if (a<0.2) { f = d3.format(".3f"); }
	          		else if (a<2) { f = d3.format(".2f"); }
	          		else if (a<20) { f = d3.format(".1f"); }
	          		else if (a<200) { f = d3.format(".0f"); }
	          		return f(v);
	          	},
	          fitIterations: 20000,
	          rhoEnd: 1e-5, // when do we consider a fit finished?
	          fit: null,
	          percentiles: {},
	          sampledCDFs: {},
	          cdfChart: null,
	          cdfChartData: null,
	          sampledPDFs: {},
	          pdfChart: null,
	          pdfChartData: null,
	          eps: 1.0e-6
			 };

	if (Object.keys) {
		var validXtKeys = Object.keys(xt);
	}

	//
	// Utility functions
	//

	var xySwap = function(a) {
		// eg. xySwap([[1,2],[3,4]]) = [[2,1],[4,3]]
		var b = [];
		for (var i=0; i<a.length; i++) {
			b.push([a[i][1], a[i][0]]);
		}
		return b;
	};
	my.xySwap = xySwap;


	var choosePoints = function() {
		// sets xt.cdf to a random [[prob,val], ...] 
		var vals = [], probs = [], cdf = [];
		var i, p;
		var n = Math.floor(Math.random()*4)+4;
		var top = Math.floor(Math.pow(2,Math.random()*15))+9;
		top = 500;
		var params = [Math.random()+1.3, (Math.random()+0.25)*top/2, (Math.random()-0.5)*top/10];
		//console.log(params);
		var w = distribution.weibull(params);
		for (i=0; i<n; i++) {
			p = (i+Math.random())/n;
			probs.push(p);
			vals.push(w.inverseCdf(p));
		}
		// add some start and end points
		// probs.push(0);
		probs.push(1);
		// vals.push(0);
		vals.push(top);
		// sort and collate into a cdf
		probs = _.sortBy(probs);
		vals = _.sortBy(vals);
		for (i=0; i<probs.length; i++) {
			cdf.push([probs[i], vals[i]]);
		}
		xt.cdf = cdf;
	};
	my.choosePoints = choosePoints;


	var interpolate2 = function(x, a, b) {
		// for given x, calculates y on the line between 
		// the two points a=[x1,y1] and b=[x2,y2]
		var x1=a[0], y1=a[1], x2=b[0], y2=b[1];
		//console.log("interpolating between ","("+x1+","+y1+") and ("+x2+","+y2+")");
		return y1 + (y2-y1)/(x2-x1)*(x-x1);
	};

	var interpolate = function(x, points) {
		// given x and a list of sorted (by x) points [[x1,y1], [x2,y2], ...]
		// defining a piecewise linear curve, return the linearly interpolated y
		// extend the first and last segments out to allow extrapolation too
		if (x<=points[0][0]) {
			return interpolate2(x, points[0], points[1]);
		}
		for (var i=1; i<points.length; i++) {
			if (x<=points[i][0]) {
				return interpolate2(x, points[i-1], points[i]);
			}
		}
		return interpolate2(x, points[points.length-2], points[points.length-1]);
	};

	var interpolateCDF = function(p) {
		return interpolate(p, xt.cdf);
	};
	my.interpolateCDF = interpolateCDF;

	//
	// DOM manipulation functions
	//

	var updatePostFit = function() {
		$(".doing-calc").addClass("hide");
		xt.percentiles = getPercentiles(100);
		xt.sampledCDFs = getSampled(200);
		xt.sampledPDFs = calcPDFsfromSampledCDFs(getSampled(200, [0,0.9995]));
		displayBestFitParams(xt.fit.params);
		updateFitCharts();
	};


	var finish = function() {
		setTimeout(function() {
			xt.percentiles = getPercentiles(100);
			xt.sampledCDFs = getSampled(200);
			xt.sampledPDFs = calcPDFsfromSampledCDFs(xt.sampledCDFs);
			updatePwLinearCDFChart();
			updatePwLinearPDFChart();
			if (typeof Worker==="undefined") {
				setTimeout(function() {
					$("body").scrollTop($("#finish-panel").offset().top-20);
				},100);
				setTimeout(function() { 
					$(".doing-calc").removeClass("hide");
					$(".best-fit").addClass("hide");
					xt.fit = fitCDFtoWeibull();
					updatePostFit(); 
				}, 250);
			} else {
				$(".doing-calc").removeClass("hide");
				$(".best-fit").addClass("hide");
				$("#refit").addClass("hide");
				var worker = new Worker("worker.js");
				worker.postMessage({cdf: xySwap(xt.cdf), 
									start: undefined,
									solverP: {maxFun: xt.fitIterations, rhoEnd: xt.rhoEnd},
									median: interpolateCDF(0.5), 
									P01: interpolateCDF(0.01)});
				worker.addEventListener("message", function(event) {
					worker.terminate();
					xt.fit = event.data;
					xt.fit.weibull = distribution.weibull(xt.fit.params);
					updatePostFit();
					if (xt.fit.status!==cobyla.normal) {
						$("#refit").removeClass("hide");
					}
				});
			}
		}, 10);
	};
	my.finish = finish;

	var displayBestFitParams = function(params) {
		$(".best-fit-shape").text(d3.format(".2f")(params[0]));
		$(".best-fit-scale").text(d3.format(",.3r")(params[1]));
		var loc=params[2];
		if (Math.abs(loc)<xt.eps) { $(".best-fit-loc").text(0); } // fix display of "0.00" and "-0.00"
		else { $(".best-fit-loc").text(d3.format(",.3r")(loc)); }
		$(".best-fit").hide();
		$(".best-fit").removeClass("hide");
		$(".best-fit").fadeIn();
	};

	//
	// Application-specific functions
	//

	var setupChart = function() {
		if (d3 && d3.elts && d3.elts.xyChart) {
			var chart = d3.elts.xyChart()
								.width(Math.min(480, $("#chart-container").width()))  // #chart-container is just a way to get chart width
								.height(310)
								.duration(1)
								.chartTypes(["line area", "line", "points"])
								.fillColor([["lightsteelblue", undefined, "white"], ["#EEE", "#666"]])
								.strokeColor(["steelblue", "#666"])
								.strokeWidth(2)
								.margin({top: 40, right: 45, bottom: 35, left: 70});
			chart.xAxis(chart.xAxis().ticks(4));
			return chart;
		} else {
			return null;
		}
	};

	var weibullCDF = function(x, params) {
		return distribution.weibull(params).cdf(x);
	};
	my.weibullCDF = weibullCDF;  // make it accessible as PRB.weibullCDF for debugging ease

	var fitCDFtoWeibull = function() {
		// only used if Worker not available
		var pwLinearCDF = xySwap(xt.cdf);
		var minX = pwLinearCDF[0][0], 
			maxX = pwLinearCDF[pwLinearCDF.length-1][0];
		// estimate starting parameters as:
		// shape = 1, scale = the median (P50), location = P01.
		var start = [1, interpolateCDF(0.5), interpolateCDF(0.01)];
		var solverP = {maxFun: Math.round(xt.fitIterations/3), rhoEnd: xt.rhoEnd};
		var p1 = cobyla.nlFit(pwLinearCDF, weibullCDF, start, [0,0], null, cobyla.constrainAsCDF, solverP);
		// have a second go, starting from scale = avg of min & max
		var start2 = [1, (minX+maxX)/2, interpolateCDF(0.01)];
		var p2 = cobyla.nlFit(pwLinearCDF, weibullCDF, start2, [0,0], null, cobyla.constrainAsCDF, solverP);
		// then take the better of the two and give it another run through the optimizer
		var currBest = (p1.obj < p2.obj ? p1.params : p2.params);
		var p = cobyla.nlFit(pwLinearCDF, weibullCDF, currBest, [0,0], null, cobyla.constrainAsCDF, solverP);
		p.maxFun = Math.round(xt.fitIterations*2/3);

		p.weibull = distribution.weibull(p.params);
		// for (i=0; i<=100; i++) {
		// 	x = interpolate2(i, [0, minX], [100, maxX]);
		// 	fittedCDF.push([x, weibullCDF(x, p.params)]);
		// }
		// p.fittedCDF = fittedCDF;
		return p;
	};

	var getPercentiles = function(n) {
		var i;
		if (typeof n === "undefined") { n=100; }
		var assessed = xt.cdf;
		var perc = [],
			percFit = [];
		for (i=0; i<=n; i++) {
			perc.push([i/n, interpolate(i/n, assessed)]);
		}
		if (xt.fit && xt.fit.weibull) {
			for (i=0; i<=n; i++) {
				percFit.push([i/n, xt.fit.weibull.inverseCdf(i/n)]);
			}
		}
		return {"assessed": perc, "fit": percFit };
	};

	var getSampled = function(n, fitRange) {
		// if fitRange is not provided, the fit uses the same domain as the assessed CDF
		// otherwise it will show the range of probs given, eg. fitRange=[0, 0.995]
		if (typeof n === "undefined") { n=100; }
		var assessed = xt.cdf,
			x,
			i,
			s = [],
			sFit = [],
			xMin = interpolate(0, assessed),
			xMax = interpolate(1, assessed),
			invAssessed = xySwap(assessed);

		for (i=0; i<=n; i++) {
			x = xMin + (xMax-xMin)*(i/n);
			s.push([x, interpolate(x, invAssessed)]);
		}
		if (xt.fit && xt.fit.weibull) {
			if (fitRange) {
				xMin = Math.min(xMin, xt.fit.weibull.inverseCdf(fitRange[0]));
				xMax = Math.max(xMax, xt.fit.weibull.inverseCdf(fitRange[1]));
			}
			for (i=0; i<=n; i++) {
				x = xMin + (xMax-xMin)*(i/n);
				sFit.push([x, xt.fit.weibull.cdf(x)]);
			}
		}
		return {"assessed": s, "fit": sFit };
	};

	var calcPDFfromCDF = function(cdf, noEnds) {
		// the argument is a cdf, eg. [[v1,p1], [v2,p2], ...]
		// assign the (change in y / change in x) to the midpt of each x
		// unless noEnds is true, it starts at 0 and ends at 0 at the first and last x
		// the result will have one more x coord than the CDF,
		// or one less if noEnds is true
		var i, pdf=[], midx, dx, dy;
		if (cdf.length<2) { return []; }
		if (!noEnds) {
			pdf = [[cdf[0][0],0]];
		}
		for (i=1; i<cdf.length; i++) {
			midx = (cdf[i][0] + cdf[i-1][0])/2;
			dx = (cdf[i][0] - cdf[i-1][0]);
			dy = (cdf[i][1] - cdf[i-1][1]);
			pdf.push([midx, dy/dx]);
		}
		if (!noEnds) {
			pdf.push([cdf[cdf.length-1][0],0]);
		}
		return pdf;
	};
	my.calcPDFfromCDF = calcPDFfromCDF;

	var calcPDFsfromSampledCDFs = function(sampledCDFs) {
		// loop through each type k of sampledCDF (ie. assessed, fit) and get PDF
		// suppress the zero-endpts on the fit
		var result = {};
		for (var k in sampledCDFs) {
			if (sampledCDFs.hasOwnProperty(k)) {
				result[k] = calcPDFfromCDF(sampledCDFs[k], k==="fit");
			}
		}
		return result;
	};

	var updatePwLinearCDFChart = function() {
		var assessedCDF = xySwap(xt.cdf);  // just the assessed points
		var sampled = xt.sampledCDFs.assessed;
		if (!xt.cdfChart) { xt.cdfChart = setupChart().smartYFormat(true); }
		xt.cdfChartData = [sampled, sampled, assessedCDF];
		d3.select("#cdf").datum(xt.cdfChartData).call(xt.cdfChart);
	};
	my.updatePwLinearCDFChart = updatePwLinearCDFChart;

	var updatePwLinearPDFChart = function() {
		var sampled = xt.sampledPDFs.assessed;
		if (!xt.pdfChart) { xt.pdfChart = setupChart().yAxis(function(){}); }
		xt.pdfChartData = [sampled, sampled];
		d3.select("#pdf").datum(xt.pdfChartData).call(xt.pdfChart);
	};
	my.updatePwLinearPDFChart = updatePwLinearPDFChart;


	var updateFitCharts = function() {
		// this next bit just for show - so the fitted curve animates off the original
		if (!xt.cdfChartData) { updatePwLinearCDFChart(); }
		if (!xt.pdfChartData) { updatePwLinearPDFChart(); }
		// to get animation to work, need to directly change the original var - not sure why?
		xt.cdfChartData[1] = xt.sampledCDFs.fit;
		d3.select("#cdf").datum(xt.cdfChartData).call(xt.cdfChart.duration(1100));

		xt.pdfChartData[1] = xt.sampledPDFs.fit;
		d3.select("#pdf").datum(xt.pdfChartData).call(xt.pdfChart.duration(1100));
	};
	my.updateFitCharts = updateFitCharts;



	my.refit = function() {
		$(".doing-calc").removeClass("hide");
		$(".best-fit").addClass("hide");
		$("#refit").addClass("hide");
		var worker = new Worker("worker.js");
		worker.postMessage({cdf: xySwap(xt.cdf), 
							start: xt.fit.params,
							solverP: {maxFun: xt.fitIterations, rhoEnd: xt.rhoEnd}});
		worker.addEventListener("message", function(event) {
			worker.terminate();
			var prevMaxFun = xt.fit.maxFun;
			xt.fit = event.data;
			xt.fit.maxFun += prevMaxFun;
			xt.fit.weibull = distribution.weibull(xt.fit.params);
			updatePostFit();
			if (xt.fit.status!==cobyla.normal) {
				$("#refit").removeClass("hide");
			}
		});
	};

	//
	// Boilerplate getter/setter functions
	//
	my.get = function(name) {
		if (!arguments.length) return xt;
		return xt[name];
	};
	my.set = function(name, val) {
		if (typeof validXtKeys!=="undefined" && validXtKeys.indexOf) {
			if (validXtKeys.indexOf(name)>=0) {
				xt[name] = val;
			} else {
				throw Error("Variable "+name+" not found");
			}
		} else {
			// on browsers without Object.keys and/or indexOf, don't check the name is valid
			xt[name] = val;
		}
		return this;
	};

	return my;

}(typeof fitdemo==="undefined" ? {} : fitdemo, jQuery, d3, _, cobyla, distribution));

