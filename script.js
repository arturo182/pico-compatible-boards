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
                $('.dataTables_paginate').hide();
            } else {
                $('.dataTables_paginate').show();
            }
        },
        columns: [
            {
                data: 'image',
                responsivePriority: 1,
                render: (data, type, row) => data ? `<img src="${data}" alt="${row.name}" class="board-image-thumbnail" data-bs-toggle="modal" data-bs-target="#imageModal" data-img-src="${data}" data-img-title="${row.name}">` : '-',
                className: 'image-col dt-control',
                orderable: false,
                searchable: false
            },
            {
                data: 'name',
                responsivePriority: 2,
                render: (data, type, row) => row.url ? `<a href="${row.url}" target="_blank">${data}</a>` : data
            },
            {
                data: 'chip',
                responsivePriority: 3
            },
            {
                data: 'flash',
                responsivePriority: 4,
                searchable: false
            },
            {
                data: 'ram',
                responsivePriority: 5,
                searchable: false
            },
            {
                data: 'usb',
                responsivePriority: 6,
                searchable: false
            },
            {
                data: 'connectivity',
                responsivePriority: 7,
                render: (data) => data && data.length > 0 ? [...data].sort().join(', ') : '-',
                searchable: false
            },
            {
                data: 'smd',
                responsivePriority: 8,
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
        columnDefs: [
            { targets: 3, render: (data, type, row) => type === 'sort' ? row.flash_bytes : data },
            { targets: 4, render: (data, type, row) => type === 'sort' ? row.ram_bytes : data }
        ],
        order: [[ 1, 'asc' ]],
        searching: true,
    });

    function populateFilters(data)
    {
        const filters = {
            chip:         { el: $('#chipFilterGroup'),         label: 'Chip',           options: new Set(),     selected: [] },
            usb:          { el: $('#usbFilterGroup'),          label: 'USB Type',       options: new Set(),     selected: [] },
            connectivity: { el: $('#connectivityFilterGroup'), label: 'Connectivity',   options: new Set(),     selected: [] },
            smd:          { el: $('#smdFilterGroup'),          label: 'SMD Mountable',  options: ['Yes', 'No'], selected: [] }
        };

        data.forEach(board => {
            if(board.chip)
                filters.chip.options.add(board.chip);

            if(board.usb)
                filters.usb.options.add(board.usb);

            if(board.connectivity)
                board.connectivity.forEach(conn => filters.connectivity.options.add(conn));
        });

        ['chip', 'usb', 'connectivity', 'smd'].forEach(key => {
            const filter = filters[key];

            let html = `
                <div class="filter-group-header">${filter.label}</div>
                <div class="filter-options">
            `;

            let sortedOptions = (key === 'smd') ? filter.options : Array.from(filter.options).sort();

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

        ['chip', 'usb', 'connectivity', 'smd'].forEach(key => {
            if (!matched)
                return;

            const selectedOptions = [];
            $(`#${key}FilterGroup .filter-checkbox:checked`).each(function() {
                selectedOptions.push($(this).val());
            });

            if (selectedOptions.length > 0) {
                if (key === 'connectivity') {
                    if (!row.connectivity || !selectedOptions.some(opt => row.connectivity.includes(opt))) {
                        matched = false;
                    }
                } else if (key === 'smd') {
                    const strValue = row.smd ? 'Yes' : 'No';
                    console.log(selectedOptions.length);
                    console.log(strValue);
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

        const modalTitle = imageModalElement.querySelector('.modal-title');
        modalTitle.textContent = triggerElement.getAttribute('data-img-title') || 'Board Image';

        const modalImageDisplay = imageModalElement.querySelector('#modalImageDisplay');
        modalImageDisplay.src = triggerElement.getAttribute('data-img-src');
    });

    imageModalElement.addEventListener('hidden.bs.modal', () =>
    {
        imageModalElement.querySelector('#modalImageDisplay').src = '';
        imageModalElement.querySelector('.modal-title').textContent = 'Board Image';
    });
});
