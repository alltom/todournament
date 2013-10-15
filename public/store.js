function LocalStore(name) {
	this.name = name;
	this.storage = new Backbone.LocalStorage(name);
}
LocalStore.prototype = {
	applyToCollection: function (collection) {
		collection.store = this;
		collection.storageName = "localStorage";
		collection.localStorage = this.storage;
	},
	makeStore: function (name) {
		return new LocalStore(name);
	},
};
