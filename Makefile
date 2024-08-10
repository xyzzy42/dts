all: dist/module.json dist/lang/en.json dist/dynamic-token-scale.js

package: module.zip

clean:
	rm -rf dist

.PHONY: all package clean

module.zip: all
	cd dist && zip -r ../$@ .

dist:
	mkdir -p dist

dist/lang: | dist
	mkdir -p dist/lang


dist/module.json: static/module.json | dist
	cp static/module.json dist

dist/lang/%: static/lang/% | dist/lang
	cp $< $@

dist/dynamic-token-scale.js: src/dynamic-token-scale.js | dist
	npx rollup $< --file $@ --format es
