"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActionNameFromElement = void 0;
var browser_core_1 = require("@datadog/browser-core");
/**
 * Get the action name from the attribute 'data-dd-action-name' on the element or any of its parent.
 * It can also be retrieved from a user defined attribute.
 */
var DEFAULT_PROGRAMMATIC_ATTRIBUTE = 'data-dd-action-name';
function getActionNameFromElement(element, userProgrammaticAttribute) {
    // Proceed to get the action name in two steps:
    // * first, get the name programmatically, explicitly defined by the user.
    // * then, use strategies that are known to return good results. Those strategies will be used on
    //   the element and a few parents, but it's likely that they won't succeed at all.
    // * if no name is found this way, use strategies returning less accurate names as a fallback.
    //   Those are much likely to succeed.
    return (getActionNameFromElementProgrammatically(element, DEFAULT_PROGRAMMATIC_ATTRIBUTE) ||
        (userProgrammaticAttribute && getActionNameFromElementProgrammatically(element, userProgrammaticAttribute)) ||
        getActionNameFromElementForStrategies(element, priorityStrategies) ||
        getActionNameFromElementForStrategies(element, fallbackStrategies) ||
        '');
}
exports.getActionNameFromElement = getActionNameFromElement;
function getActionNameFromElementProgrammatically(targetElement, programmaticAttribute) {
    var elementWithAttribute;
    // We don't use getActionNameFromElementForStrategies here, because we want to consider all parents,
    // without limit. It is up to the user to declare a relevant naming strategy.
    // If available, use element.closest() to match get the attribute from the element or any of its
    // parent.  Else fallback to a more traditional implementation.
    if (supportsElementClosest()) {
        elementWithAttribute = targetElement.closest("[" + programmaticAttribute + "]");
    }
    else {
        var element = targetElement;
        while (element) {
            if (element.hasAttribute(programmaticAttribute)) {
                elementWithAttribute = element;
                break;
            }
            element = element.parentElement;
        }
    }
    if (!elementWithAttribute) {
        return;
    }
    var name = elementWithAttribute.getAttribute(programmaticAttribute);
    return truncate(normalizeWhitespace(name.trim()));
}
var priorityStrategies = [
    // associated LABEL text
    function (element) {
        // IE does not support element.labels, so we fallback to a CSS selector based on the element id
        // instead
        if (supportsLabelProperty()) {
            if ('labels' in element && element.labels && element.labels.length > 0) {
                return getTextualContent(element.labels[0]);
            }
        }
        else if (element.id) {
            var label = element.ownerDocument && element.ownerDocument.querySelector("label[for=\"" + element.id.replace('"', '\\"') + "\"]");
            return label && getTextualContent(label);
        }
    },
    // INPUT button (and associated) value
    function (element) {
        if (element.nodeName === 'INPUT') {
            var input = element;
            var type = input.getAttribute('type');
            if (type === 'button' || type === 'submit' || type === 'reset') {
                return input.value;
            }
        }
    },
    // BUTTON, LABEL or button-like element text
    function (element) {
        if (element.nodeName === 'BUTTON' || element.nodeName === 'LABEL' || element.getAttribute('role') === 'button') {
            return getTextualContent(element);
        }
    },
    function (element) { return element.getAttribute('aria-label'); },
    // associated element text designated by the aria-labelledby attribute
    function (element) {
        var labelledByAttribute = element.getAttribute('aria-labelledby');
        if (labelledByAttribute) {
            return labelledByAttribute
                .split(/\s+/)
                .map(function (id) { return getElementById(element, id); })
                .filter(function (label) { return Boolean(label); })
                .map(getTextualContent)
                .join(' ');
        }
    },
    function (element) { return element.getAttribute('alt'); },
    function (element) { return element.getAttribute('name'); },
    function (element) { return element.getAttribute('title'); },
    function (element) { return element.getAttribute('placeholder'); },
    // SELECT first OPTION text
    function (element) {
        if ('options' in element && element.options.length > 0) {
            return getTextualContent(element.options[0]);
        }
    },
];
var fallbackStrategies = [function (element) { return getTextualContent(element); }];
/**
 * Iterates over the target element and its parent, using the strategies list to get an action name.
 * Each strategies are applied on each element, stopping as soon as a non-empty value is returned.
 */
var MAX_PARENTS_TO_CONSIDER = 10;
function getActionNameFromElementForStrategies(targetElement, strategies) {
    var element = targetElement;
    var recursionCounter = 0;
    while (recursionCounter <= MAX_PARENTS_TO_CONSIDER &&
        element &&
        element.nodeName !== 'BODY' &&
        element.nodeName !== 'HTML' &&
        element.nodeName !== 'HEAD') {
        for (var _i = 0, strategies_1 = strategies; _i < strategies_1.length; _i++) {
            var strategy = strategies_1[_i];
            var name_1 = strategy(element);
            if (typeof name_1 === 'string') {
                var trimmedName = name_1.trim();
                if (trimmedName) {
                    return truncate(normalizeWhitespace(trimmedName));
                }
            }
        }
        // Consider a FORM as a contextual limit to get the action name.  This is experimental and may
        // be reconsidered in the future.
        if (element.nodeName === 'FORM') {
            break;
        }
        element = element.parentElement;
        recursionCounter += 1;
    }
}
function normalizeWhitespace(s) {
    return s.replace(/\s+/g, ' ');
}
function truncate(s) {
    return s.length > 100 ? browser_core_1.safeTruncate(s, 100) + " [...]" : s;
}
function getElementById(refElement, id) {
    // Use the element ownerDocument here, because tests are executed in an iframe, so
    // document.getElementById won't work.
    return refElement.ownerDocument ? refElement.ownerDocument.getElementById(id) : null;
}
function getTextualContent(element) {
    if (element.isContentEditable) {
        return;
    }
    if ('innerText' in element) {
        var text = element.innerText;
        if (!supportsInnerTextScriptAndStyleRemoval()) {
            // remove the inner text of SCRIPT and STYLES from the result. This is a bit dirty, but should
            // be relatively fast and work in most cases.
            var elementsTextToRemove = element.querySelectorAll('script, style');
            // eslint-disable-next-line @typescript-eslint/prefer-for-of
            for (var i = 0; i < elementsTextToRemove.length; i += 1) {
                var innerText = elementsTextToRemove[i].innerText;
                if (innerText.trim().length > 0) {
                    text = text.replace(innerText, '');
                }
            }
        }
        return text;
    }
    return element.textContent;
}
/**
 * Returns true if element.innerText excludes the text from inline SCRIPT and STYLE element. This
 * should be the case everywhere except on Internet Explorer 10 and 11 (see [1])
 *
 * The innerText property relies on what is actually rendered to compute its output, so to check if
 * it actually excludes SCRIPT and STYLE content, a solution would be to create a style element, set
 * its content to '*', inject it in the document body, and check if the style element innerText
 * property returns '*'. Using a new `document` instance won't work as it is not rendered.
 *
 * This solution requires specific CSP rules (see [2]) to be set by the customer. We want to avoid
 * this, so instead we rely on browser detection. In case of false negative, the impact should be
 * low, since we rely on this result to remove the SCRIPT and STYLE innerText (which will be empty)
 * from a parent element innerText.
 *
 * [1]: https://web.archive.org/web/20210602165716/http://perfectionkills.com/the-poor-misunderstood-innerText/#diff-with-textContent
 * [2]: https://github.com/DataDog/browser-sdk/issues/1084
 */
function supportsInnerTextScriptAndStyleRemoval() {
    return !browser_core_1.isIE();
}
/**
 * Returns true if the browser supports the element.labels property.  This should be the case
 * everywhere except on Internet Explorer.
 * Note: The result is computed lazily, because we don't want any DOM access when the SDK is
 * evaluated.
 */
var supportsLabelPropertyResult;
function supportsLabelProperty() {
    if (supportsLabelPropertyResult === undefined) {
        supportsLabelPropertyResult = 'labels' in HTMLInputElement.prototype;
    }
    return supportsLabelPropertyResult;
}
/**
 * Returns true if the browser supports the element.closest method.  This should be the case
 * everywhere except on Internet Explorer.
 * Note: The result is computed lazily, because we don't want any DOM access when the SDK is
 * evaluated.
 */
var supportsElementClosestResult;
function supportsElementClosest() {
    if (supportsElementClosestResult === undefined) {
        supportsElementClosestResult = 'closest' in HTMLElement.prototype;
    }
    return supportsElementClosestResult;
}
//# sourceMappingURL=getActionNameFromElement.js.map