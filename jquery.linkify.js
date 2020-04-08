// 2020-04-08 Modified by Tom to add rel="noreferrer noopener"
$.fn.linkify = function () {
	this.html(linkify(this.html()));
	return this;

	function linkify(s) {
		// from https://gist.github.com/arbales/1654670
		LINK_DETECTION_REGEX = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;\(\)]*[-A-Z0-9+&@#\/%=~_|\(\)])/ig;
		return s.replace(LINK_DETECTION_REGEX, function (url) {
			var suffix = "";
			if (/\)$/.test(url) && !/\(/.test(url)) {
				url = url.slice(0, url.length - 1);
				suffix = ")";
			}
			var address = /[a-z]+:\/\//.test(url) ? url : "http://" + url;
			return "<a href='" + address + "' target='_blank' rel='noreferrer noopener'>" + url + "</a>" + suffix;
		});
	}
};
