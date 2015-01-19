//
// Fit the provided data to a nonlinear curve
//

cobyla = (function(my) {
    "use strict"
    // adds nlFit to cobyla, if it exists

	my.nlFit = function nlFit(data, fitFn, start, min, max, constraints, solverParams) {
		// nlFit will minimize the sum of squared differences (y1^2-y2^2) between
		// the data points (x,y1) and the fitFn (x,y2).
		//
		// Returns an object {params: [the best-fit parameters], obj: sum sqr diff, status: status}
		// where status 0 = normal, 1 = max iterations reached, 2 = diverging rounding errors
		//
		// eg.
		//     data = [[0,0.01], [5, 0.1], [100,0.5], [500, 0.9], [1000,0.99]];
		//     cobyla.nlFit(data, weibullCDF, [1, 5, 1], [0,0,0], null, cobyla.constrainAsCDF, {maxFun: 5000});
		//
		// data should be of the form [[x1,y1], [x2,y2], ...]
		// eg. [[0,0.01], [5, 0.1], [100,0.5], [500, 0.9], [1000,0.99]]
		// fitFn should be a function of x and an array of parameters
		//
		// start, min, max are arrays of values for the parameters
		// start is required
		// min, max are ignored if falsy
		//
		// contraints (optional) is a function of the data, fitFn & the parameters
		// which returns an array of inequalities (>0),
		// eg. if params=[a,b,c] then constraints(params) might return
		//     [0,1,1,2,5,10]
		//     each of which will passed into the solver as constraints >0
		//
		// solverParams is an object with any of the keys rhoStart, rhoEnd, iprint, maxFun
		// if any of the keys are missing they default to 5, 1e-6, 0 and 5000 respectively

		var x = start;
		var numConstraints = 0;
		if (min) { numConstraints += min.length; }
		if (max) { numConstraints += max.length; }
		if (constraints) { numConstraints += constraints(data, fitFn, x).length; }
		if (!solverParams) { solverParams = {}; }

		var defaultSPs = { rhoStart: 5.0, rhoEnd: 1.0e-6, iprint: 0, maxFun: 3500 };

		function obj(n, m, x, con) {
			// objective function
			// n is the number of variables to solve for
			// m is the number of constraints
			// x is an array of the variables
			// con is an array of the constraints

			var sumSqr = 0;
			var c = 0;
			var i, yData, yFit, cx;

			for (i=0; i<data.length; i++) {
				yData = data[i][1];
				yFit  = fitFn(data[i][0], x);
				sumSqr += (yData - yFit) * (yData - yFit);
			}
			if (min) {
				for (i=0; i<min.length; i++) { con[c++] = x[i] - min[i]; } // x - min > 0, ie. x > min
			}
			if (max) {
				for (i=0; i<max.length; i++) { con[c++] = max[i] - x[i]; } // max - x > 0, ie. x < max
			}
			if (constraints) {
				cx = constraints(data, fitFn, x);
				for (i=0; i<cx.length; i++) { con[c++] = cx[i]; }
			}
			return sumSqr;
		}

		var status = cobyla.findMinimum(obj, 
							 x.length,
							 numConstraints,
							 x,
							 typeof solverParams.rhoStart==="undefined" ? defaultSPs.rhoStart : solverParams.rhoStart,
							 typeof solverParams.rhoEnd==="undefined" ? defaultSPs.rhoEnd : solverParams.rhoEnd,
							 typeof solverParams.iprint==="undefined" ? defaultSPs.iprint : solverParams.iprint,
							 typeof solverParams.maxFun==="undefined" ? defaultSPs.maxFun : solverParams.maxFun );

		return {params: x, obj: obj(x.length, numConstraints, x, new Array(numConstraints)), status: status};
	}

	//
	// sample constraints function
	//

	my.constrainAsCDF = function (data, fitFn, params) {
		// Requires the fit function to be between 0 and 1 at each data point
		var constraints = [],
			yFit;
		for (var i=0; i<data.length; i++) {
			yFit = fitFn(data[i][0], params);
			constraints.push(yFit);  // require yFit > 0
			constraints.push(1-yFit);  // require 1 - yFit > 0, ie. yFit < 1
		}
		return constraints;
	}

    return my;

}(typeof cobyla==="undefined" ? {} : cobyla));
