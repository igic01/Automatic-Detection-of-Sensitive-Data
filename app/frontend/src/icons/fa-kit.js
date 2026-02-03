import {
    faCrop,
    faFloppyDisk,
    faFolderOpen as faFolderOpenSolid,
    faPen,
    faPlus,
    faRotateLeft
} from "@fortawesome/free-solid-svg-icons";
import {
    faFileLines,
    faFolderOpen as faFolderOpenRegular
} from "@fortawesome/free-regular-svg-icons";

export const byPrefixAndName = {
    fas: {
        plus: faPlus,
        "folder-open": faFolderOpenSolid,
        "floppy-disk": faFloppyDisk,
        pen: faPen,
        "rotate-left": faRotateLeft,
        crop: faCrop
    },
    far: {
        "folder-open": faFolderOpenRegular,
        "file-lines": faFileLines
    },
    fak: {
        "my-icon": faPlus
    }
};

