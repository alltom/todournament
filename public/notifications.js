// browser notifications

var notesEnabled = {
	request: function (callback) {
		setTimeout(function () {
			callback && callback(true)
		}, 0);
	},
	post: function (title, body) {
		this.closeLast();

		try {
			var note = this.lastNote = webkitNotifications.createNotification(null /* iconUrl */, title, body);
			note.onclick = function () {
				window.focus();
			};
		} catch (e) {
			console.error("creating notification failed with error", e);
			return;
		}

		note.show();
	},
	closeLast: function () {
		if (this.lastNote) {
			this.lastNote.cancel();
			delete this.lastNote;
		}
	},
	supported: true,
	enabled: true,
};

var notesDisabled = {
	request: function (callback) {
		webkitNotifications.requestPermission(function () {
			var enabled = setupNotifications();
			callback && callback(enabled);
		});
	},
	post: function () {},
	closeLast: function () {},
	supported: true,
	enabled: false,
};

var notesNotSupported = {
	request: function (callback) {
		alert("Notifications are only available in Chrome at the moment. Sorry.");
		setTimeout(function () {
			callback && callback(false)
		}, 0);
	},
	post: function () {},
	closeLast: function () {},
	supported: false,
	enabled: false,
};

var notes = notesNotSupported;

function setupNotifications() {
	if (window.webkitNotifications) {
		switch (webkitNotifications.checkPermission()) {
		case 0: // PERMISSION_ALLOWED
			notes = notesEnabled;
			return true;
		case 1: // PERMISSION_NOT_ALLOWED (fall through to next case)
		case 2: // PERMISSION_DENIED
		default:
			notes = notesDisabled;
			return false;
		}
	} else {
		notes = notesNotSupported;
		return false;
	}
}

window.addEventListener("beforeunload", function () { notes.closeLast() });
