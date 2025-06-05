$(document).ready(function()
{
    const table = $('#boardsTable').DataTable({
        ajax: {
            url: 'board_data.json',
            dataSrc: (json) => {
                populateFilters(json.data);

                return json.data;
            }
        },
        responsive: {
            details: {
                type: 'inline',
            }
        },
        pageLength: 50,
        drawCallback: function () {
            const api = this.api();
            const pageInfo = api.page.info();

            if (pageInfo.pages <= 1) {
                $('.dt-paging').hide();
            } else {
                $('.dt-paging').show();
            }
        },
        columns: [
            {
                data: 'thumbnail',
                responsivePriority: 2,
                render: (data, type, row) => `<img src="${data}" alt="${row.name}" class="board-image-thumbnail" data-bs-toggle="modal" data-bs-target="#imageModal" data-img-src="${row.image}" data-img-title="${row.name}">`,
                className: 'dt-center image-column',
                width: '50px',
                orderable: false,
                searchable: false
            },
            {
                data: 'name',
                responsivePriority: 1,
                render: (data, type, row) => row.url ? `<a href="${row.url}" target="_blank">${data}</a>` : data
            },
            {
                data: 'chip',
                responsivePriority: 3
            },
            {
                data: 'cores',
                responsivePriority: 4,
                align: 'center'
            },
            {
                data: 'flash',
                type: 'num',
                responsivePriority: 5,
                render: (data, type, row) => type === 'sort' ? row.flash_bytes : data,
                searchable: false
            },
            {
                data: 'ram',
                type: 'num',
                responsivePriority: 6,
                render: (data, type, row) => type === 'sort' ? row.ram_bytes : data,
                searchable: false
            },
            {
                data: 'usb',
                responsivePriority: 7,
                searchable: false
            },
            {
                data: 'dimensions',
                responsivePriority: 8
            },
            {
                data: 'connectivity',
                responsivePriority: 9,
                render: (data) => data && data.length > 0 ? [...data].sort().join(', ') : '-',
                searchable: false
            },
            {
                data: 'connectors',
                responsivePriority: 10,
                render: (data) => data && data.length > 0 ? [...data].sort().join(', ') : '-',
                searchable: false
            },
            {
                data: 'smd',
                responsivePriority: 11,
                className: 'smd-column',
                render: (data) => data ? 'Yes' : 'No',
                searchable: false
            },
            {
                data: 'notes',
                responsivePriority: 10001,
                className: 'notes-column',
                orderable: false
            }
        ],
        order: [[ 1, 'asc' ]],
        searching: true,
        autoWidth: false,
        fixedHeader: true,
    });

    table.on('responsive-resize', function (e, datatable, columns) {
        const anyHidden = columns.includes(false);
        const firstCol = table.column(0).nodes().to$();
        if (anyHidden) {
            firstCol.addClass('control');
        } else {
            firstCol.removeClass('control');
        }
    });

    function populateFilters(data)
    {
        const filters = {
            chip:         { el: $('#chipFilterGroup'),         label: 'Chip',            options: new Set(),     selected: [] },
            cores:        { el: $('#coresFilterGroup'),        label: 'Cores',           options: new Set(),     selected: [] },
            usb:          { el: $('#usbFilterGroup'),          label: 'USB Type',        options: new Set(),     selected: [] },
            dimensions:   { el: $('#dimensionsFilterGroup'),   label: 'Dimensions (mm)', options: new Set(),     selected: [] },
            connectivity: { el: $('#connectivityFilterGroup'), label: 'Connectivity',    options: new Set(),     selected: [] },
            connectors:   { el: $('#connectorsFilterGroup'),   label: 'Connectors',    options: new Set(),     selected: [] },
            smd:          { el: $('#smdFilterGroup'),          label: 'SMD Mountable',   options: ['Yes', 'No'], selected: [] }
        };

        data.forEach(board => {
            if(board.chip)
                filters.chip.options.add(board.chip);

            if(board.cores)
                filters.cores.options.add(board.cores);

            if(board.usb)
                filters.usb.options.add(board.usb);

            if(board.dimensions)
                filters.dimensions.options.add(board.dimensions);

            if(board.connectivity)
                board.connectivity.forEach(conn => filters.connectivity.options.add(conn));

            if(board.connectors)
                board.connectors.forEach(conn => filters.connectors.options.add(conn));
        });

        ['chip', 'cores', 'usb', 'dimensions', 'connectivity', 'connectors', 'smd'].forEach(key => {
            const filter = filters[key];

            let html = `
                <div class="filter-group-header">${filter.label}</div>
                <div class="filter-options">
            `;

            let sortedOptions = Array.from(filter.options).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
            if (key === 'smd')
                sortedOptions = filter.options;

            sortedOptions.forEach(option => {
                if (!option && option !== false)
                    return;

                const optionVal = (typeof option === 'boolean') ? (option ? 'Yes' : 'No') : option;
                const optionId = `${key}-${optionVal.toString().replace(/\W/g, '')}`;

                html += `
                    <div class="form-check">
                        <input class="form-check-input filter-checkbox" type="checkbox" value="${optionVal}" id="${optionId}" data-filter-key="${key}">
                        <label class="form-check-label" for="${optionId}">${optionVal}</label>
                    </div>
                `;
            });
            html += `</div>`;
            filter.el.html(html);
        });

        $('#flashFilterGroup').html(`
            <div class="filter-group-header">Flash (KB)</div>
            <div class="range-filter-group">
                <input type="number" id="flashMin" class="form-control form-control-sm" placeholder="Min">
                <span>-</span>
                <input type="number" id="flashMax" class="form-control form-control-sm" placeholder="Max">
            </div>
        `);

        $('#ramFilterGroup').html(`
            <div class="filter-group-header">RAM (KB)</div>
            <div class="range-filter-group">
                <input type="number" id="ramMin" class="form-control form-control-sm" placeholder="Min">
                <span>-</span>
                <input type="number" id="ramMax" class="form-control form-control-sm" placeholder="Max">
            </div>
        `);

        $('.filter-checkbox').on('change', function () { table.draw() });
        $('#flashMin, #flashMax, #ramMin, #ramMax').on('keyup change', function () { table.draw() });
    }

    $.fn.dataTable.ext.search.push(function (settings, data, dataIndex)
    {
        if (settings.nTable.id !== 'boardsTable')
            return true;

        const row = table.row(dataIndex).data();
        let matched = true;

        ['chip', 'cores', 'usb', 'dimensions', 'connectivity', 'connectors', 'smd'].forEach(key => {
            if (!matched)
                return;

            const selectedOptions = [];
            $(`#${key}FilterGroup .filter-checkbox:checked`).each(function() {
                selectedOptions.push($(this).val());
            });

            if (selectedOptions.length > 0) {
                if (key === 'connectivity') {
                    if (!row.connectivity || selectedOptions.some(opt => !row.connectivity.includes(opt))) {
                        matched = false;
                    }
                } else if (key === 'connectors') {
                    if (!row.connectors || selectedOptions.some(opt => !row.connectors.includes(opt))) {
                        matched = false;
                    }
                } else if (key === 'smd') {
                    const strValue = row.smd ? 'Yes' : 'No';
                    if (selectedOptions.length === 1 && !selectedOptions.includes(strValue)) {
                        matched = false;
                    }
                } else {
                    if (!selectedOptions.includes(row[key])) {
                        matched = false;
                    }
                }
            }
        });

        if (!matched)
            return false;

        const flashMinKB = parseInt($('#flashMin').val()) || 0;
        const flashMaxKB = parseInt($('#flashMax').val()) || Infinity;
        const flashKB = row.flash_bytes / 1024;

        if (!(flashKB >= flashMinKB && flashKB <= flashMaxKB))
            return false;

        const ramMinKB = parseInt($('#ramMin').val()) || 0;
        const ramMaxKB = parseInt($('#ramMax').val()) || Infinity;
        const ramKB = row.ram_bytes / 1024;

        if (!(ramKB >= ramMinKB && ramKB <= ramMaxKB))
            return false;

        return true;
    });

    var imageModalElement = document.getElementById('imageModal');

    imageModalElement.addEventListener('show.bs.modal', (event) =>
    {
        const triggerElement = event.relatedTarget;
        const imgSrc = triggerElement.getAttribute('data-img-src');
        const imgTitle = triggerElement.getAttribute('data-img-title') || 'Board Image';

        const modalTitle = imageModalElement.querySelector('.modal-title');
        modalTitle.textContent = imgTitle;

        const modalImageDisplay = imageModalElement.querySelector('#modalImageDisplay');
        modalImageDisplay.src = '';
        modalImageDisplay.alt = 'Loading...';
        modalImageDisplay.style.display = 'none';

        const modalBody = imageModalElement.querySelector('.modal-body');
        let loadingSpinner = modalBody.querySelector('.loading-spinner');
        if (!loadingSpinner) {
            loadingSpinner = document.createElement('div');
            loadingSpinner.className = 'loading-spinner text-center';
            loadingSpinner.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';
            modalBody.appendChild(loadingSpinner);
        }
        loadingSpinner.style.display = 'block';

        const fullImg = new Image();
        fullImg.onload = function() {
            modalImageDisplay.src = imgSrc;
            modalImageDisplay.alt = imgTitle;
            modalImageDisplay.style.display = 'block';
            loadingSpinner.style.display = 'none';
        };
        fullImg.onerror = function() {
            modalImageDisplay.alt = 'Failed to load image!';
            modalImageDisplay.style.display = 'block';
            loadingSpinner.style.display = 'none';
        };
        fullImg.src = imgSrc;
    });

    imageModalElement.addEventListener('hidden.bs.modal', () =>
    {
        const modalImageDisplay = imageModalElement.querySelector('#modalImageDisplay');
        const loadingSpinner = imageModalElement.querySelector('.loading-spinner');

        modalImageDisplay.src = '';
        modalImageDisplay.style.display = 'none';
        if (loadingSpinner) {
            loadingSpinner.style.display = 'none';
        }

        imageModalElement.querySelector('.modal-title').textContent = 'Board Image';
    });
});
