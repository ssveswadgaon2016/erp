import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import FormInput from '../../components/FormInput';
import SelectInput from '../../components/SelectInput';
import Button from '../../components/Button';
import { Save, UserPlus, Printer } from 'lucide-react';
import { createStudent, getClasses, getAdmissionFormHtml } from '../../services/api';

const AdminAdmissions = () => {
  const [form, setForm] = useState({
    grNo: '', name: '', fatherName: '', motherName: '', dob: '', gender: '',
    class: '', phone: '', email: '', address: '', previousSchool: '', passportPhoto: '',
    caste: '', subCaste: '', religion: '', placeOfBirth: '', nationality: 'Indian', fatherEducation: '', motherEducation: '',
    surname: '', isTcIssued: false, aadhaarNumber: '', penNumber: '', isRTE: false,
  }); 
  const [classOptions, setClassOptions] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [lastStudent, setLastStudent] = useState(null);
  const [error, setError] = useState('');

   
  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    setError('');

    try {
      const classes = await getClasses();
      const options = classes.flatMap((item) => {
        if (!item.sections || item.sections.length === 0) {
          return [{ value: item.name, label: item.name }];
        }
        return item.sections.map((section) => {
          const value = `${item.name}-${section}`;
          return { value, label: value };
        });
      });

      setClassOptions(options);
    } catch (err) {
      setError(err.message || 'Unable to load classes.');
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  const handlePassportPhotoChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) {
      setForm((prev) => ({ ...prev, passportPhoto: '' }));
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file for passport photo.');
      e.target.value = '';
      return;
    }

    // Keep the payload lightweight because image is stored as a data URL.
    if (file.size > 2 * 1024 * 1024) {
      setError('Passport photo must be smaller than 2MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setError('');
      setForm((prev) => ({ ...prev, passportPhoto: String(reader.result || '') }));
    };
    reader.onerror = () => {
      setError('Unable to read selected image. Please try another file.');
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handlePrintAdmissionForm = async (studentId) => {
    try {
      const html = await getAdmissionFormHtml(studentId);
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
      } else {
        alert('Please allow popups to print the admission form.');
      }
    } catch (err) {
      alert(err.message || 'Failed to open print window.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSubmitting(true);
    setError('');

    try {
      const createdStudent = await createStudent({
        ...form,
        parentContact: form.phone,
        admissionDate: new Date().toISOString().split('T')[0],
      });

      setLastStudent(createdStudent);
      setSubmitted(true);
      setForm({ grNo: '', name: '', fatherName: '', motherName: '', dob: '', gender: '', class: '', phone: '', email: '', address: '', previousSchool: '', passportPhoto: '', caste: '', subCaste: '', religion: '', placeOfBirth: '', nationality: 'Indian', fatherEducation: '', motherEducation: '', surname: '', isTcIssued: false, aadhaarNumber: '', penNumber: '', isRTE: false });
    } catch (err) {
      setError(err.message || 'Unable to submit admission.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Student Admissions" subtitle="Register new student admission" />

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {submitted && lastStudent && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-fade-in">
          <div>
            <h4 className="font-semibold text-emerald-900 flex items-center gap-2 text-base">
              ✓ Student Admission Recorded Successfully!
            </h4>
            <p className="text-sm mt-0.5 text-emerald-700">
              Admission form is generated for <strong>{lastStudent.name}</strong> (ID: {lastStudent.studentId || lastStudent.id}).
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => handlePrintAdmissionForm(lastStudent.id)}
              className="!bg-white !text-emerald-700 border border-emerald-200 hover:!bg-emerald-100/50 flex items-center gap-2"
            >
              <Printer className="w-4 h-4" /> Print Admission Form
            </Button>
            <Button
              variant="secondary"
              onClick={() => setSubmitted(false)}
              className="!bg-white !text-slate-500 border border-slate-200 hover:!bg-slate-50"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-6">
        <h3 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2"><UserPlus className="w-5 h-5" /> New Admission Form</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormInput label="General Register No. (GR No.)" value={form.grNo} onChange={(e) => setForm({ ...form, grNo: e.target.value })} />
          <FormInput label="Student Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <FormInput label="Surname" value={form.surname} onChange={(e) => setForm({ ...form, surname: e.target.value })} />

          <FormInput label="Father's Name" value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} required />
          <FormInput label="Mother's Name" value={form.motherName} onChange={(e) => setForm({ ...form, motherName: e.target.value })} required />
          <FormInput label="Date of Birth" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} required />
          <SelectInput label="Gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} placeholder="Select" options={[
            { value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' },
          ]} required />
          <SelectInput
            label="Admission Class"
            value={form.class}
            onChange={(e) => setForm({ ...form, class: e.target.value })}
            placeholder={loadingClasses ? 'Loading classes...' : 'Select class'}
            options={classOptions}
            required
          />
          <FormInput label="Phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          <FormInput label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <FormInput label="Nationality" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
          <FormInput label="Place of Birth" value={form.placeOfBirth} onChange={(e) => setForm({ ...form, placeOfBirth: e.target.value })} />
          <FormInput label="Religion" value={form.religion} onChange={(e) => setForm({ ...form, religion: e.target.value })} />
          <FormInput label="Caste" value={form.caste} onChange={(e) => setForm({ ...form, caste: e.target.value })} />
          <FormInput label="Sub-Caste" value={form.subCaste} onChange={(e) => setForm({ ...form, subCaste: e.target.value })} />
          <FormInput label="Father's Education" value={form.fatherEducation} onChange={(e) => setForm({ ...form, fatherEducation: e.target.value })} />
          <FormInput label="Mother's Education" value={form.motherEducation} onChange={(e) => setForm({ ...form, motherEducation: e.target.value })} />
          <FormInput label="Previous School" value={form.previousSchool} onChange={(e) => setForm({ ...form, previousSchool: e.target.value })} />
          <SelectInput label="TC Issued (Historical)" value={form.isTcIssued ? 'Yes' : 'No'} onChange={(e) => setForm({ ...form, isTcIssued: e.target.value === 'Yes' })} options={[
            { value: 'No', label: 'No' }, { value: 'Yes', label: 'Yes' }
          ]} />
          
          <div className="flex items-center mt-6">
            <input
              type="checkbox"
              id="isRTE"
              checked={form.isRTE}
              onChange={(e) => setForm({ ...form, isRTE: e.target.checked })}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="isRTE" className="ml-2 text-sm font-medium text-slate-700">
              Is this an RTE Admission?
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Passport Size Photo</label>
            <input
              type="file"
              accept="image/*"
              onChange={handlePassportPhotoChange}
              className="input-field file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
            {form.passportPhoto && (
              <img
                src={form.passportPhoto}
                alt="Passport preview"
                className="mt-2 h-20 w-20 rounded-md object-cover border border-slate-200"
              />
            )}
          </div>
          <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
            <FormInput label="Student Aadhaar Number" value={form.aadhaarNumber} onChange={(e) => setForm({ ...form, aadhaarNumber: e.target.value })} />
            <FormInput label="Student P.E.N Number" value={form.penNumber} onChange={(e) => setForm({ ...form, penNumber: e.target.value })} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Address</label>
            <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input-field h-20 resize-none" required />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" type="reset">Reset</Button>
          <Button type="submit" disabled={submitting || loadingClasses}><Save className="w-4 h-4" /> {submitting ? 'Submitting...' : 'Submit Admission'}</Button>
        </div>
      </form>
    </div>
  );
};

export default AdminAdmissions;
