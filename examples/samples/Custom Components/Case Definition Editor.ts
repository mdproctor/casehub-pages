var editor = document.getElementById('case-editor');
if (editor) {
  fetch('fixtures/case-onboarding.yaml')
    .then(function(r) { return r.text(); })
    .then(function(text) { (editor as any).value = text; });
}
