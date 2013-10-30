(function () {
	var batches = 0; // number of active batch operations
	var waiters = []; // [{ f: func, context: obj }, ...]

	// perform a batch operation
	window.doBatch = function (op, context) {
		console.group("batch");
		batches++;
		try {
			op.call(context);
		} finally {
			--batches;
			console.log("exec waiters");
			execWaitersIfNecessary();
			console.log("batch done");
			console.groupEnd();
		}
	};

	// create a version of f that gets executed at the end of all current batch
	// operations, or immediately if there are none
	window.atBatchEnd = function (f, context) {
		return function () {
			// if they're already waiting, return
			for (var i in waiters) {
				if (waiters[i].f === f) {
					return;
				}
			}

			// wait, and execute if it's time
			waiters.push({ f: f, context: context });
			execWaitersIfNecessary();
		}
	};

	function execWaitersIfNecessary() {
		if (batches === 0) {
			execWaiters();
		}
	}

	function execWaiters() {
		var w = waiters.slice();
		waiters = [];
		w.forEach(function (waiter) {
			try {
				waiter.f.call(waiter.context);
			} catch (e) {
				console.log(e.stack);
			}
		});
	}
}());

// batch(function () {
// 	destroyAll();
// });

// on("x", atBatchEnd(function () { console.log("a batch is over!") }));
