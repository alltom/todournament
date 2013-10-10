// adapted from http://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array-in-javascript
function shuffle(array) {
	for (var counter = array.length - 1; counter >= 0; counter--) {
		var index = (Math.random() * (counter + 1)) | 0;

		// swap
		var tmp = array[index];
		array[index] = array[counter];
		array[counter] = tmp;
	}

	return array;
}
