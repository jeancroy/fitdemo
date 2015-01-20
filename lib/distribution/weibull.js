//
//  Adds Weibull distribution to the "distribution" global var
//
distribution = (function(my) {
    "use strict";

	function gammaFunction(n) {
	// using Lanczos approximation
		var g = 7, // precision
			p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 
			     12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7],
			x, i, t;
		if (n<0.5) {
			return Math.PI / Math.sin(n * Math.PI) / gammaFunction(1 - n);
		} else {
			n = n - 1;
			x = p[0];
			for (i=1; i<g+2; i++) {
				x += p[i] / (n + i);
			}
			t = n + g + 0.5;
			return Math.sqrt(2*Math.PI) * Math.pow(t, (n+0.5)) * Math.exp(-t) * x;
		}
	}

    my.weibull = function(params) {
		// commented parameter naming from:
		//     http://en.wikipedia.org/wiki/Weibull_distribution,
		//     http://reliawiki.org/index.php/The_Weibull_Distribution, and
		//     Mathematica,  respectively
		var shape = params[0],  // shape or slope, k, beta, alpha >0	
			scale = params[1] || 1,  // scale, lambda, eta, beta >0
			loc = params[2] || 0;    // location, theta, gamma, mu (0 for the 2-parameter distn)

    	var distn = {};

		distn.cdf = function(x) {
			return (x>loc) ? 1-Math.exp(-Math.pow((x-loc)/scale,shape)) : 0;
		};

		distn.inverseCdf = function(p) {
			return scale * Math.pow(-Math.log(1-p), 1/shape) + loc;
		};

		distn.mean = function() {
			return loc + scale * gammaFunction(1+1/shape);
		};

		return distn;
    };

    return my;

}(typeof distribution==="undefined" ? {} : distribution));
