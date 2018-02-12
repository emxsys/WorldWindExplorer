/*
 * The MIT License
 * Copyright (c) 2016 Bruce Schubert.
 */

/*global WorldWind*/

define([
    'knockout',
    'model/Constants',
    'model/milstd2525/TacticalSymbol',
    'worldwind'],
    function (
        ko,
        constants,
        TacticalSymbol) {

        "use strict";
        /**
         * Constructs a SymbolManager that manages a collection of TacticalSymbols.
         * @param {Globe} globe
         * @param {RenderableLayer} layer Optional.
         * @constructor
         */
        var SymbolManager = function (globe, layer) {
            var self = this;
            this.globe = globe;
            this.layer = layer || globe.findLayer(constants.LAYER_NAME_MARKERS);
            this.symbols = ko.observableArray();

            // Subscribe to "arrayChange" events ...
            // documented here: http://blog.stevensanderson.com/2013/10/08/knockout-3-0-release-candidate-available/
            this.symbols.subscribe(function (changes) {
                changes.forEach(function (change) {
                    if (change.status === 'added' && change.moved === undefined) {
                        // Ensure the name is unique by appending a suffix if reqd.
                        // (but not if the array reordered -- i.e., moved items)
                        self.doEnsureUniqueName(change.value);
                        self.doAddSymbolToLayer(change.value);
                    } else if (change.status === 'deleted' && change.moved === undefined) {
                        // When a symbol is removed we must remove the placemark,
                        // (but not if the array reordered -- i.e., moved items)
                        self.doRemoveSymbolFromLayer(change.value);
                    }
                });
            }, null, "arrayChange");
        };

        /**
         * Adds a TacticalSymbol to this manager.
         * @param {TacticalSymbol} symbol The symbol to be managed.
         */
        SymbolManager.prototype.addSymbol = function (symbol) {
            this.symbols.push(symbol);  // observable
        };

        /**
         * Finds the symbol with the given id.
         * @param {String} id System assigned id for the symbol.
         * @returns {SymbolNode} The symbol object if found, else null.
         */
        SymbolManager.prototype.findSymbol = function (id) {
            var symbol, i, len;
            for (i = 0, len = this.symbols.length(); i < len; i += 1) {
                symbol = this.symbols()[i];
                if (symbol.id === id) {
                    return symbol;
                }
            }
            return null;
        };


        /**
         * Removes the given symbol from the symbols array and from the symbol's renderable layer.
         * @param {TacticalSymbol} symbol The symbol to be removed
         */
        SymbolManager.prototype.removeSymbol = function (symbol) {
            this.symbols.remove(symbol);
        };

        // Internal method to ensure the name is unique by appending a suffix if reqd.
        SymbolManager.prototype.doEnsureUniqueName = function (symbol) {
            symbol.name(this.generateUniqueName(symbol));
        };

        // Internal method to remove the placemark from its layer.
        SymbolManager.prototype.doAddSymbolToLayer = function (symbol) {
            this.layer.addRenderable(symbol.placemark);
        };

        // Internal method to remove the placemark from its layer.
        SymbolManager.prototype.doRemoveSymbolFromLayer = function (symbol) {
            var i, max, placemark = symbol.placemark;
            // Remove the placemark from the renderable layer
            for (i = 0, max = this.layer.renderables.length; i < max; i++) {
                if (this.layer.renderables[i] === placemark) {
                    this.layer.renderables.splice(i, 1);
                    break;
                }
            }
            this.globe.selectController.doDeselect(symbol);
        };

        /**
         * Saves the symbols list to local storage.
         */
        SymbolManager.prototype.saveSymbols = function () {
            var validSymbols = [],
                symbolsString,
                i, len, symbol;

            // Knockout's toJSON can fail on complex objects... it appears
            // to recurse and a call stack limit can be reached. So here we
            // create a simplfied version of the object here to pass to toJSON.
            for (var i = 0, len = this.symbols().length; i < len; i++) {
                symbol = this.symbols()[i];
                if (!symbol.invalid) {
                    validSymbols.push({
                        id: symbol.id,
                        name: symbol.name,
                        source: symbol.source,
                        latitude: symbol.latitude,
                        longitude: symbol.longitude,
                        isMovable: symbol.isMovable
                    });
                }
            }
            symbolsString = ko.toJSON(validSymbols, ['id', 'name', 'source', 'latitude', 'longitude', 'isMovable']);
            localStorage.setItem(constants.STORAGE_KEY_MARKERS, symbolsString);
        };

        /**
         * Restores the symbols list from local storage.
         */
        SymbolManager.prototype.restoreSymbols = function () {
            var string = localStorage.getItem(constants.STORAGE_KEY_MARKERS),
                array, max, i,
                position, params;

            // Convert JSON array to array of objects
            array = JSON.parse(string);
            if (array && array.length !== 0) {
                for (i = 0, max = array.length; i < max; i++) {
                    position = new WorldWind.Position(array[i].latitude, array[i].longitude, 0);
                    params = {id: array[i].id, name: array[i].name, imageSource: array[i].source, isMovable: array[i].isMovable};

                    this.addSymbol(new TacticalSymbol(this, position, params));
                }
            }
        };


        /**
         * Generates a unique name by appending a suffix '(n)'.
         * @param {TacticalSymbol} symbol
         * @returns {String}
         */
        SymbolManager.prototype.generateUniqueName = function (symbol) {
            var uniqueName = symbol.name().trim(),
                otherSymbol,
                isUnique,
                suffixes,
                seqNos,
                n, i, len;

            // Loop while name not unique
            do {
                // Assume uniqueness, set to false if we find a matching name
                isUnique = true;

                // Test the name for uniqueness with the other symbols
                for (i = 0, len = this.symbols().length; i < len; i += 1) {
                    otherSymbol = this.symbols()[i];
                    if (otherSymbol === symbol) {
                        continue; // Don't test with self
                    }
                    if (otherSymbol.name() === uniqueName) {
                        isUnique = false;

                        // check for existing suffix '(n)' and increment
                        suffixes = uniqueName.match(/[(]\d+[)]$/);
                        if (suffixes) {
                            // increment an existing suffix's sequence number
                            seqNos = suffixes[0].match(/\d+/);
                            n = parseInt(seqNos[0], 10) + 1;
                            uniqueName = uniqueName.replace(/[(]\d+[)]$/, '(' + n + ')');
                        } else {
                            // else if no suffix, create one
                            uniqueName += ' (2)';   // The first duplicate is #2
                        }
                        // Break out of the for loop and recheck uniqueness
                        break;
                    }
                }
            } while (!isUnique);

            return uniqueName;
        };

        return SymbolManager;
    }
);
