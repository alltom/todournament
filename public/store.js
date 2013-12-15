function LocalStore(scope, name) {
	this.scope = scope;
	this.name = name;
	this.storage = new Backbone.LocalStorage(scope ? (scope + "-" + name) : name);
}
LocalStore.prototype = {
	applyToCollection: function (collection) {
		collection.store = this;
		collection.storageName = "localStorage";
		collection.localStorage = this.storage;
	},

	makeStore: function (scope, name) {
		return new LocalStore(scope ? scope : this.scope, name);
	},
};

function DropboxStore(scope, name) {
	console.log(scope, name)
	this.scope = scope;
	this.name = name;
	if (scope) {
		this.storage = new Backbone.DropboxDatastore(name, { datastoreId: scope });
	} else {
		this.storage = new Backbone.DropboxDatastore(name);
	}
}
DropboxStore.prototype = {
	applyToCollection: function (collection) {
		collection.store = this;
		collection.storageName = "dropbox";
		collection.dropboxDatastore = this.storage;
	},

	makeStore: function (scope, name) {
		return new DropboxStore(scope ? scope : this.scope, name);
	},
};
