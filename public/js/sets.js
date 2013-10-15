function isInSet(arr, item) {
	return arr.indexOf(item) !== -1;
}

function addToSet(arr, item) {
	var idx = arr.indexOf(item);
	if (idx === -1) {
		arr.push(item);
	}
}

function removeFromSet(arr, item) {
	var idx = arr.indexOf(item);
	if (idx !== -1) {
		arr.splice(idx, 1);
	}
}
