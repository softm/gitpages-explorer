document.addEventListener('DOMContentLoaded', function() {
  fetch('/attach_file.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    })
    .then(data => {
      const currentPagePath = decodeURIComponent(window.location.pathname.substring(1));
      const pageData = data[currentPagePath];

      if (pageData && pageData.files && pageData.files.length > 0) {
        const container = document.createElement('div');
        container.innerHTML = '<h2>첨부 파일</h2>';
        const ul = document.createElement('ul');

        pageData.files.forEach(fileName => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = `./${encodeURIComponent(pageData.files_dir)}/${encodeURIComponent(fileName)}`;
          a.textContent = fileName;
          li.appendChild(a);
          ul.appendChild(li);
        });

        container.appendChild(ul);
        const enNote = document.querySelector('en-note');
        if (enNote) {
            enNote.appendChild(container);
        } else {
            document.body.appendChild(container);
        }
      }
    })
    .catch(error => console.error('Error loading attachment data:', error));
});
