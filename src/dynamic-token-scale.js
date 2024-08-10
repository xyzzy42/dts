const MODULENAME = "dynamic-token-scale";

// Methods for TokenLayer
function refreshTokensSize() {
    this.ownedTokens.forEach((t) => t._refreshSize());
}

// Methods for Token
/**
 * Return fit and token's X & Y scale values.
 * This takes into account the current global token scaling modes.
 */
function _tokenScale() {
    let { fit, scaleX, scaleY } = this.document.texture;
    if (this.hasDynamicRing) {
        if (this.layer?.dynamicFullScale) {
            scaleX *= this.ring.fullScale;
            scaleY *= this.ring.fullScale;
            //console.log(`Scale to full size ${this.document.texture.scaleX} to ${scaleX}`);
        }
    } else {
        if (this.layer?.staticMatchScale) {
            if (this.dynamicScale === undefined) {
                // It would make more sense to do this in #initializeRing(), but
                // that is private so I can't patch it.
                const size = Math.min(this.document.width ?? 1, this.document.height ?? 1);
                this.dynamicScale = CONFIG.Token.ring.ringClass.getRingDataBySize(size).fullScale;
            }
            scaleX /= this.dynamicScale;
            scaleY /= this.dynamicScale;
            //console.log(`Scale to ⅔ size ${this.document.texture.scaleX} to ${scaleX}`);
        }
    }
    return { fit, scaleX, scaleY };
}

// This is a copy of the foundry function with a small change
function _refreshMesh() {
    let {
        alpha,
        texture: { anchorX, anchorY, tint, alphaThreshold },
    } = this.document;
    const { width, height } = this.getSize();
    this.mesh.resize(width, height, this._tokenScale());
    this.mesh.anchor.set(anchorX, anchorY);
    this.mesh.alpha = this.alpha * alpha;
    this.mesh.tint = tint;
    this.mesh.textureAlphaThreshold = alphaThreshold;
    this.mesh.occludedAlpha = 0.5;
}

// This is a copy of the foundry function with a small change
function _refreshSize() {
    const { width, height } = this.getSize();
    this.mesh.resize(width, height, this._tokenScale());
    this.nameplate.position.set(width / 2, height + 2);
    this.tooltip.position.set(width / 2, -2);
    if (this.hasDynamicRing) this.ring.configureSize();
}

function updateCanvasScale() {
    const dsMode = game.settings.get(MODULENAME, "dynamicScalingMode");
    if (dsMode === "OD100") {
        game.canvas.tokens.dynamicFullScale = true;
        game.canvas.tokens.staticMatchScale = false;
    } else if (dsMode === "ID66") {
        game.canvas.tokens.dynamicFullScale = false;
        game.canvas.tokens.staticMatchScale = true;
    } else {
        game.canvas.tokens.dynamicFullScale = false;
        game.canvas.tokens.staticMatchScale = false;
    }
}

Hooks.once("init", () => {
    console.info(`${MODULENAME} | Initializing`);

    Object.defineProperty(TokenLayer.prototype, "dynamicFullScale", { value: false, writable: true });
    Object.defineProperty(TokenLayer.prototype, "staticMatchScale", { value: false, writable: true });
    Object.defineProperty(TokenLayer.prototype, "refreshTokensSize", { value: refreshTokensSize });

    Object.defineProperty(Token.prototype, "_tokenScale", { value: _tokenScale });
    Object.defineProperty(Token.prototype, "_refreshMesh", { value: _refreshMesh });
    Object.defineProperty(Token.prototype, "_refreshSize", { value: _refreshSize });

    game.settings.register(MODULENAME, "dynamicScalingMode", {
        name: game.i18n.localize(`${MODULENAME}.setting.name`),
        hint: game.i18n.localize(`${MODULENAME}.setting.hint`),
        scope: "client",
        config: true,
        requiresReload: false,
        type: String,
        choices: {
            none: game.i18n.localize(`${MODULENAME}.setting.none`),
            OD100: game.i18n.localize(`${MODULENAME}.setting.OD100`),
            ID66: game.i18n.localize(`${MODULENAME}.setting.ID66`),
        },
        default: "none",
        onChange: () => {
            updateCanvasScale();
            game.canvas.tokens.refreshTokensSize();
        },
    });
});

Hooks.once("canvasInit", () => {
    console.info(`${MODULENAME} | canvasInit`);

    // Load settings into TokenLayer
    updateCanvasScale();

    const TokenRing = CONFIG.Token.ring.ringClass;
    class ScaledTokenRing extends TokenRing {
        // Because #ringData is private this is far more complex than it needs to be
        static #ringDataScale;

        static createAssetsUVs() {
            TokenRing.createAssetsUVs();

            const spritesheet = TextureLoader.loader.getCache(CONFIG.Token.ring.spritesheet);
            const frames = Object.keys(spritesheet.data.frames || {});
            // Better to just add this to ringData
            this.#ringDataScale = new Map();
            for (const asset of frames) {
                if (asset.includes("-bkg")) continue;
                const assetTexture = PIXI.Assets.cache.get(asset);
                const sprite = new PIXI.Sprite(assetTexture);
                const border = ((s, image) => {
                    for (let m = 0; m < Math.min(s.width, s.height) / 2; m++) {
                        for (let i = m; i < s.width - m; i++) {
                            if (image[(m * s.width + i) * 4 + 3]) return { border: m, side: "V" };
                            if (image[((s.height - 1 - m) * s.width + i) * 4 + 3]) return { border: m, side: "V" };
                            if (image[(i * s.width + m) * 4 + 3]) return { border: m, side: "H" };
                            if (image[(i * s.width + s.width - 1 - m) * 4 + 3]) return { border: m, side: "H" };
                        }
                    }
                    return null;
                })(sprite, canvas.app.renderer.extract.pixels(sprite));
                sprite.destroy();
                const side = border?.side === "V" ? assetTexture.height : assetTexture.width;
                this.#ringDataScale.set(asset, !border ? 1.0 : side / (side - 2 * border.border));
            }
        }

        static getRingDataBySize(size) {
            const data = TokenRing.getRingDataBySize(size);
            data.fullScale = this.#ringDataScale.get(data.ringName);
            return data;
        }
    }

    CONFIG.Token.ring.ringClass = ScaledTokenRing;
});
